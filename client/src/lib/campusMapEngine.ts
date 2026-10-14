import type { CampusPlaceDTO, CampusPathEdge } from '@kamand/shared';

/**
 * Offline Campus Map Engine (Section 13)
 * - Normalizes every hostel block format (`A-12`, `A12`, `a 12`, `A block 12`, `hostel B 19`, `c-10`)
 *   to its canonical `{ hostel, block }` or `code`.
 * - Performs instant offline fuzzy + alias search across all campus places.
 * - Computes walking routes on-device using A* over the campus walkable path graph,
 *   supporting `stepFree` mode (avoiding stairs) and generating turn-by-turn campus instructions.
 * - Computes nearest-landmark plain-language descriptions ("You're near the Central Library, about 35 m from Nescafé")
 *   and evaluates the ~30 m GPS accuracy fallback threshold.
 */

export interface ParsedHostelBlock {
  hostel: string;
  block: string;
  canonicalCode: string;
}

/**
 * Parses any variation of a hostel block query:
 * - `"A-12"`, `"A12"`, `"a 12"`, `"A block 12"`, `"Hostel B-19"`, `"b block 19"`, `"c 10"`
 * into `{ hostel: "A", block: "12", canonicalCode: "A-12" }`.
 */
export function parseHostelBlockQuery(rawQuery: string): ParsedHostelBlock | null {
  const cleaned = rawQuery
    .trim()
    .replace(/\b(hostel|block|blk|room|building)\b/gi, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = cleaned.match(/^([a-dA-D])\s*(\d{1,3})(?:\s*[-a-zA-Z0-9]*)?$/);
  if (!match) return null;

  const hostel = match[1]!.toUpperCase();
  const block = String(parseInt(match[2]!, 10));
  return {
    hostel,
    block,
    canonicalCode: `${hostel}-${block}`,
  };
}

/**
 * Instant offline search over `places` supporting hostel block normalization,
 * exact alias matching, prefix matching, and substring fuzzy matching.
 */
export function searchCampusPlacesOffline(
  query: string,
  places: CampusPlaceDTO[]
): CampusPlaceDTO[] {
  const trimmed = query.trim();
  if (!trimmed) return places;

  const parsedBlock = parseHostelBlockQuery(trimmed);
  if (parsedBlock) {
    const exactBlockMatches = places.filter(
      (p) =>
        (p.hostel?.toUpperCase() === parsedBlock.hostel &&
          p.block === parsedBlock.block) ||
        p.code.toUpperCase() === parsedBlock.canonicalCode ||
        p.code.toUpperCase().startsWith(`${parsedBlock.hostel}${parsedBlock.block}-`)
    );
    if (exactBlockMatches.length > 0) {
      return exactBlockMatches;
    }
  }

  const qLower = trimmed.toLowerCase();
  const qCompact = qLower.replace(/[-\s_]+/g, '');

  const scored: Array<{ place: CampusPlaceDTO; score: number }> = [];

  for (const place of places) {
    let bestScore = 0;
    const codeLower = place.code.toLowerCase();
    const codeCompact = codeLower.replace(/[-\s_]+/g, '');
    const nameLower = place.canonicalName.toLowerCase();

    if (codeLower === qLower || codeCompact === qCompact) {
      bestScore = 100;
    } else if (
      place.aliases.some(
        (a) =>
          a.toLowerCase() === qLower ||
          a.toLowerCase().replace(/[-\s_]+/g, '') === qCompact
      )
    ) {
      bestScore = 95;
    } else if (nameLower.startsWith(qLower) || codeLower.startsWith(qLower)) {
      bestScore = 85;
    } else if (
      nameLower.includes(qLower) ||
      place.aliases.some((a) => a.toLowerCase().includes(qLower)) ||
      place.category.toLowerCase().includes(qLower)
    ) {
      bestScore = 70;
    }

    if (bestScore > 0) {
      scored.push({ place, score: bestScore });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.place);
}

/**
 * Resolves a single best matching place for a code or query (`"A-12"`, `"b19"`, `"c 10"`, `"library"`, `"mess"`).
 */
export function resolvePlaceByQuery(
  query: string,
  places: CampusPlaceDTO[]
): CampusPlaceDTO | null {
  if (!query.trim()) return null;
  const matches = searchCampusPlacesOffline(query, places);
  return matches[0] ?? null;
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest campus places to a given coordinate and formats a plain-language
 * campus position description ("You're near the Central Library, about 40 m from Nescafé").
 */
export function describePositionInCampusLanguage(
  lat: number,
  lng: number,
  places: CampusPlaceDTO[]
): {
  nearestPlace: CampusPlaceDTO | null;
  distanceMeters: number;
  description: string;
} {
  if (places.length === 0) {
    return {
      nearestPlace: null,
      distanceMeters: 0,
      description: 'On IIT Mandi Campus',
    };
  }

  const ranked = places
    .map((place) => ({
      place,
      dist: Math.round(haversineDistanceMeters(lat, lng, place.lat, place.lng)),
    }))
    .sort((a, b) => a.dist - b.dist);

  const primary = ranked[0]!;
  const secondary = ranked[1];

  const description = secondary
    ? `You’re near ${primary.place.canonicalName}, about ${secondary.dist} m from ${secondary.place.canonicalName}`
    : `You’re near ${primary.place.canonicalName} (${primary.dist} m)`;

  return {
    nearestPlace: primary.place,
    distanceMeters: primary.dist,
    description,
  };
}

/**
 * Evaluates whether the browser's reported GPS accuracy (in meters) requires showing
 * the manual landmark fallback banner (> 30 m threshold per Section 13).
 */
export function shouldShowAccuracyFallbackBanner(accuracyMeters: number | null | undefined): boolean {
  if (accuracyMeters === null || accuracyMeters === undefined || Number.isNaN(accuracyMeters)) {
    return true;
  }
  return accuracyMeters > 30;
}

export interface RouteStep {
  fromPlace: CampusPlaceDTO;
  toPlace: CampusPlaceDTO;
  distanceMeters: number;
  stepFree: boolean;
  instruction: string;
}

export interface ComputedWalkingRoute {
  found: boolean;
  nodeIds: string[];
  places: CampusPlaceDTO[];
  steps: RouteStep[];
  totalDistanceMeters: number;
  estimatedWalkMinutes: number;
  stepFree: boolean;
}

/**
 * Client-Side A* Walking Router over the Campus Path Graph (Section 13)
 * - Supports `stepFreeOnly: true` to exclude stair edges (`stepFree: false`).
 * - Uses Haversine distance to the goal as an admissible heuristic.
 * - Produces turn-by-turn instructions in campus language, total distance (m), and walking time (mins at 1.3m/s).
 */
export function computeCampusWalkingRouteAStar(params: {
  startPlaceId: string;
  goalPlaceId: string;
  places: CampusPlaceDTO[];
  edges: CampusPathEdge[];
  stepFreeOnly?: boolean;
}): ComputedWalkingRoute {
  const { startPlaceId, goalPlaceId, places, edges, stepFreeOnly = false } = params;
  const placeMap = new Map<string, CampusPlaceDTO>(places.map((p) => [p.id, p]));

  const startPlace = placeMap.get(startPlaceId);
  const goalPlace = placeMap.get(goalPlaceId);

  if (!startPlace || !goalPlace) {
    return {
      found: false,
      nodeIds: [],
      places: [],
      steps: [],
      totalDistanceMeters: 0,
      estimatedWalkMinutes: 0,
      stepFree: stepFreeOnly,
    };
  }

  if (startPlaceId === goalPlaceId) {
    return {
      found: true,
      nodeIds: [startPlaceId],
      places: [startPlace],
      steps: [],
      totalDistanceMeters: 0,
      estimatedWalkMinutes: 1,
      stepFree: true,
    };
  }

  // Build bidirectional adjacency list
  const adjacency = new Map<
    string,
    Array<{ neighborId: string; edge: CampusPathEdge }>
  >();

  for (const edge of edges) {
    if (stepFreeOnly && !edge.stepFree) continue;

    const listA = adjacency.get(edge.fromId) ?? [];
    listA.push({ neighborId: edge.toId, edge });
    adjacency.set(edge.fromId, listA);

    const listB = adjacency.get(edge.toId) ?? [];
    listB.push({
      neighborId: edge.fromId,
      edge: {
        fromId: edge.toId,
        toId: edge.fromId,
        distanceMeters: edge.distanceMeters,
        stepFree: edge.stepFree,
        instructionHint: edge.instructionHint,
      },
    });
    adjacency.set(edge.toId, listB);
  }

  const openSet = new Set<string>([startPlaceId]);
  const cameFrom = new Map<string, { prevId: string; edge: CampusPathEdge }>();
  const gScore = new Map<string, number>([[startPlaceId, 0]]);
  const fScore = new Map<string, number>([
    [
      startPlaceId,
      haversineDistanceMeters(
        startPlace.lat,
        startPlace.lng,
        goalPlace.lat,
        goalPlace.lng
      ),
    ],
  ]);

  while (openSet.size > 0) {
    let currentId: string | null = null;
    let lowestF = Infinity;
    for (const candidateId of openSet) {
      const score = fScore.get(candidateId) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentId = candidateId;
      }
    }

    if (!currentId) break;

    if (currentId === goalPlaceId) {
      // Reconstruct path
      const nodeIds: string[] = [currentId];
      const steps: RouteStep[] = [];
      let cursor = currentId;

      while (cameFrom.has(cursor)) {
        const prevInfo = cameFrom.get(cursor)!;
        const fromP = placeMap.get(prevInfo.prevId)!;
        const toP = placeMap.get(cursor)!;
        steps.unshift({
          fromPlace: fromP,
          toPlace: toP,
          distanceMeters: prevInfo.edge.distanceMeters,
          stepFree: prevInfo.edge.stepFree,
          instruction:
            prevInfo.edge.instructionHint ||
            `Walk ${prevInfo.edge.distanceMeters} m from ${fromP.canonicalName} to ${toP.canonicalName}`,
        });
        nodeIds.unshift(prevInfo.prevId);
        cursor = prevInfo.prevId;
      }

      const totalDistanceMeters = steps.reduce((sum, s) => sum + s.distanceMeters, 0);
      // Average campus walking speed ~75 meters/minute
      const estimatedWalkMinutes = Math.max(1, Math.ceil(totalDistanceMeters / 75));

      return {
        found: true,
        nodeIds,
        places: nodeIds.map((id) => placeMap.get(id)!),
        steps,
        totalDistanceMeters,
        estimatedWalkMinutes,
        stepFree: steps.every((s) => s.stepFree),
      };
    }

    openSet.delete(currentId);
    const neighbors = adjacency.get(currentId) ?? [];

    for (const { neighborId, edge } of neighbors) {
      const tentativeG = (gScore.get(currentId) ?? Infinity) + edge.distanceMeters;
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, { prevId: currentId, edge });
        gScore.set(neighborId, tentativeG);
        const neighborPlace = placeMap.get(neighborId);
        const h = neighborPlace
          ? haversineDistanceMeters(
              neighborPlace.lat,
              neighborPlace.lng,
              goalPlace.lat,
              goalPlace.lng
            )
          : 0;
        fScore.set(neighborId, tentativeG + h);
        openSet.add(neighborId);
      }
    }
  }

  return {
    found: false,
    nodeIds: [],
    places: [],
    steps: [],
    totalDistanceMeters: 0,
    estimatedWalkMinutes: 0,
    stepFree: stepFreeOnly,
  };
}
