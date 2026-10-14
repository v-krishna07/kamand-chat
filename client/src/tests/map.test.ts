import { describe, expect, it } from 'vitest';
import {
  parseHostelBlockQuery,
  resolvePlaceByQuery,
  searchCampusPlacesOffline,
  computeCampusWalkingRouteAStar,
  describePositionInCampusLanguage,
  shouldShowAccuracyFallbackBanner,
} from '../lib/campusMapEngine.js';
import type { CampusPlaceDTO, CampusPathEdge } from '@kamand/shared';

const FIXTURE_PLACES: CampusPlaceDTO[] = [
  {
    id: 'place-a12',
    code: 'A-12',
    canonicalName: 'Hostel A-12 (South Campus)',
    aliases: ['A-12', 'A12', 'a 12', 'A block 12'],
    category: 'hostel',
    hostel: 'A',
    block: '12',
    lat: 31.7742,
    lng: 76.9842,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
  {
    id: 'place-b12',
    code: 'B-12',
    canonicalName: 'Hostel B-12 (North Campus)',
    aliases: ['B-12', 'B12', 'b 12', 'B block 12'],
    category: 'hostel',
    hostel: 'B',
    block: '12',
    lat: 31.7768,
    lng: 76.9862,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
  {
    id: 'place-b19',
    code: 'B-19',
    canonicalName: 'Hostel B-19 (North Campus)',
    aliases: ['B-19', 'B19', 'b 19', 'B block 19'],
    category: 'hostel',
    hostel: 'B',
    block: '19',
    lat: 31.7774,
    lng: 76.9869,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
  {
    id: 'place-c10',
    code: 'C-10',
    canonicalName: 'Hostel C-10 (North Campus)',
    aliases: ['C-10', 'C10', 'c 10', 'C block 10'],
    category: 'hostel',
    hostel: 'C',
    block: '10',
    lat: 31.7779,
    lng: 76.9875,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
  {
    id: 'place-pine-mess',
    code: 'PINE-MESS',
    canonicalName: 'Pine Mess (Pure Vegetarian Dining)',
    aliases: ['pine mess', 'mess', 'vegetarian mess'],
    category: 'mess',
    hostel: null,
    block: null,
    lat: 31.7771,
    lng: 76.9865,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
  {
    id: 'place-library',
    code: 'LIBRARY',
    canonicalName: 'Central Library · IIT Mandi',
    aliases: ['library', 'central library'],
    category: 'library',
    hostel: null,
    block: null,
    lat: 31.7758,
    lng: 76.9855,
    isPlaceholderCoord: true,
    entrances: ['Main Entrance'],
    notes: '',
  },
];

const FIXTURE_EDGES: CampusPathEdge[] = [
  // Direct stair shortcut between B-12 and B-19 (65m, NOT step-free)
  {
    fromId: 'place-b12',
    toId: 'place-b19',
    distanceMeters: 65,
    stepFree: false,
    instructionHint: 'Climb the North Hostel staircase shortcut to B-19',
  },
  // Step-free ramp route via Pine Mess (48m + 52m = 100m, step-free)
  {
    fromId: 'place-b12',
    toId: 'place-pine-mess',
    distanceMeters: 48,
    stepFree: true,
    instructionHint: 'Take ramp to Pine Mess',
  },
  {
    fromId: 'place-pine-mess',
    toId: 'place-b19',
    distanceMeters: 52,
    stepFree: true,
    instructionHint: 'Walk courtyard ramp from Pine Mess to B-19',
  },
  {
    fromId: 'place-b19',
    toId: 'place-c10',
    distanceMeters: 70,
    stepFree: true,
    instructionHint: 'Walk paved lane to C-10',
  },
  // Note: place-a12 is intentionally disconnected in this fixture graph to test no-path behavior
];

describe('Phase 8 Gate Suite: Hostel Alias Resolution, Offline Search, Client-Side A* (Shortest, Step-Free, No-Path), Nearest-Place Lookup & Accuracy Fallback', () => {
  it('1. Resolves every format of A-12, B-19, C-10 ("A-12", "A12", "a 12", "A block 12", "hostel b 19", "c10") plus "library" and "mess" offline', () => {
    for (const variant of ['A-12', 'A12', 'a 12', 'A block 12', 'hostel a 12']) {
      expect(parseHostelBlockQuery(variant)?.canonicalCode).toBe('A-12');
      expect(resolvePlaceByQuery(variant, FIXTURE_PLACES)?.id).toBe('place-a12');
    }

    for (const variant of ['B-19', 'B19', 'b 19', 'B block 19', 'Hostel B-19']) {
      expect(parseHostelBlockQuery(variant)?.canonicalCode).toBe('B-19');
      expect(resolvePlaceByQuery(variant, FIXTURE_PLACES)?.id).toBe('place-b19');
    }

    for (const variant of ['C-10', 'C10', 'c 10', 'C block 10']) {
      expect(parseHostelBlockQuery(variant)?.canonicalCode).toBe('C-10');
      expect(resolvePlaceByQuery(variant, FIXTURE_PLACES)?.id).toBe('place-c10');
    }

    expect(resolvePlaceByQuery('library', FIXTURE_PLACES)?.id).toBe('place-library');
    expect(resolvePlaceByQuery('mess', FIXTURE_PLACES)?.id).toBe('place-pine-mess');
    expect(searchCampusPlacesOffline('North Campus', FIXTURE_PLACES).length).toBeGreaterThanOrEqual(
      3
    );
  });

  it('2. Computes shortest walking path with A*, switches to ramp route when stepFreeOnly is enabled, and returns found: false when no path exists', () => {
    // 1. Standard shortest path from B-12 to B-19 -> takes 65m stair shortcut
    const shortest = computeCampusWalkingRouteAStar({
      startPlaceId: 'place-b12',
      goalPlaceId: 'place-b19',
      places: FIXTURE_PLACES,
      edges: FIXTURE_EDGES,
      stepFreeOnly: false,
    });
    expect(shortest.found).toBe(true);
    expect(shortest.totalDistanceMeters).toBe(65);
    expect(shortest.nodeIds).toEqual(['place-b12', 'place-b19']);
    expect(shortest.stepFree).toBe(false);

    // 2. Step-free route from B-12 to B-19 -> avoids stairs and routes via Pine Mess (48 + 52 = 100m)
    const stepFreeRoute = computeCampusWalkingRouteAStar({
      startPlaceId: 'place-b12',
      goalPlaceId: 'place-b19',
      places: FIXTURE_PLACES,
      edges: FIXTURE_EDGES,
      stepFreeOnly: true,
    });
    expect(stepFreeRoute.found).toBe(true);
    expect(stepFreeRoute.totalDistanceMeters).toBe(100);
    expect(stepFreeRoute.nodeIds).toEqual([
      'place-b12',
      'place-pine-mess',
      'place-b19',
    ]);
    expect(stepFreeRoute.stepFree).toBe(true);

    // 3. Disconnected node (A-12 to B-19 in fixture graph) -> found: false
    const noPath = computeCampusWalkingRouteAStar({
      startPlaceId: 'place-a12',
      goalPlaceId: 'place-b19',
      places: FIXTURE_PLACES,
      edges: FIXTURE_EDGES,
    });
    expect(noPath.found).toBe(false);
    expect(noPath.steps).toHaveLength(0);
  });

  it('3. Performs nearest-place lookup in plain campus language and triggers accuracy fallback banner when GPS accuracy > 30m', () => {
    const pos = describePositionInCampusLanguage(31.7758, 76.9855, FIXTURE_PLACES);
    expect(pos.nearestPlace?.id).toBe('place-library');
    expect(pos.description).toContain('Central Library');

    expect(shouldShowAccuracyFallbackBanner(12)).toBe(false);
    expect(shouldShowAccuracyFallbackBanner(30)).toBe(false);
    expect(shouldShowAccuracyFallbackBanner(31)).toBe(true);
    expect(shouldShowAccuracyFallbackBanner(65)).toBe(true);
    expect(shouldShowAccuracyFallbackBanner(null)).toBe(true);
  });
});
