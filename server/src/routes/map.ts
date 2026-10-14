import { Router } from 'express';
import {
  UpsertCampusPlaceInputSchema,
  type CampusPlaceDTO,
} from '@kamand/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import {
  DEFAULT_CAMPUS_PLACES,
  DEFAULT_CAMPUS_PATH_EDGES,
} from '../campus/map/mapData.js';

export const mapRouter = Router();

function parseStringArray(json: string, fallback: string[] = []): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : fallback;
  } catch {
    return fallback;
  }
}

function rowToPlaceDTO(row: {
  id: string;
  code: string;
  canonicalName: string;
  aliasesJson: string;
  category: string;
  hostel: string | null;
  block: string | null;
  lat: number;
  lng: number;
  isPlaceholderCoord: boolean;
  entrancesJson: string;
  notes: string;
}): CampusPlaceDTO {
  return {
    id: row.id,
    code: row.code,
    canonicalName: row.canonicalName,
    aliases: parseStringArray(row.aliasesJson, [row.code]),
    category: row.category as CampusPlaceDTO['category'],
    hostel: row.hostel,
    block: row.block,
    lat: row.lat,
    lng: row.lng,
    isPlaceholderCoord: row.isPlaceholderCoord,
    entrances: parseStringArray(row.entrancesJson, ['Main Entrance']),
    notes: row.notes,
  };
}

export async function ensureDefaultMapPlacesSeeded(): Promise<void> {
  const count = await prisma.place.count();
  if (count > 0) return;

  for (const p of DEFAULT_CAMPUS_PLACES) {
    await prisma.place
      .upsert({
        where: { code: p.code },
        update: {},
        create: {
          id: p.id,
          code: p.code,
          canonicalName: p.canonicalName,
          aliasesJson: JSON.stringify(p.aliases),
          category: p.category,
          hostel: p.hostel ?? null,
          block: p.block ?? null,
          lat: p.lat,
          lng: p.lng,
          isPlaceholderCoord: p.isPlaceholderCoord,
          entrancesJson: JSON.stringify(p.entrances),
          notes: p.notes,
        },
      })
      .catch(() => undefined);
  }
}

// 1. Get Full Campus Map Bundle (Places + Walkable Path Graph + GeoJSON FeatureCollection)
// Note: User geolocation is NEVER sent to or stored by this endpoint (§13 Hard Rule).
mapRouter.get('/bundle', requireAuth, async (_req, res, next) => {
  try {
    await ensureDefaultMapPlacesSeeded();
    const rows = await prisma.place.findMany({ orderBy: { code: 'asc' } });
    const places = rows.map(rowToPlaceDTO);

    const geojson = {
      type: 'FeatureCollection',
      features: places.map((p) => ({
        type: 'Feature',
        properties: {
          id: p.id,
          code: p.code,
          canonicalName: p.canonicalName,
          category: p.category,
          hostel: p.hostel,
          block: p.block,
          isPlaceholderCoord: p.isPlaceholderCoord,
        },
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat],
        },
      })),
    };

    res.status(200).json({
      places,
      edges: DEFAULT_CAMPUS_PATH_EDGES,
      geojson,
    });
  } catch (err) {
    next(err);
  }
});

// 2. Admin Map Editor: Create or Update a Campus Pin (Place / Alias / Coordinates)
mapRouter.put('/places', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const role = req.authUser!.role;
    if (role !== 'admin' && role !== 'super_admin' && role !== 'moderator') {
      res.status(403).json({ error: 'Only campus admins or moderators can edit map pins.' });
      return;
    }

    const parsed = UpsertCampusPlaceInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid map place payload',
      });
      return;
    }

    const {
      id,
      code,
      canonicalName,
      aliases,
      category,
      hostel,
      block,
      lat,
      lng,
      entrances,
      notes,
    } = parsed.data;

    const placeId = id || `place-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const mergedAliases = Array.from(new Set([code, ...aliases]));

    const upserted = await prisma.place.upsert({
      where: { code },
      update: {
        canonicalName,
        aliasesJson: JSON.stringify(mergedAliases),
        category,
        hostel: hostel ?? null,
        block: block ?? null,
        lat,
        lng,
        isPlaceholderCoord: false,
        entrancesJson: JSON.stringify(entrances),
        notes,
      },
      create: {
        id: placeId,
        code,
        canonicalName,
        aliasesJson: JSON.stringify(mergedAliases),
        category,
        hostel: hostel ?? null,
        block: block ?? null,
        lat,
        lng,
        isPlaceholderCoord: false,
        entrancesJson: JSON.stringify(entrances),
        notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.authUser!.id,
        action: 'MAP_PLACE_UPSERTED',
        targetId: upserted.id,
        metadata: JSON.stringify({ code, lat, lng }),
        ipAddress: req.ip ?? null,
      },
    });

    res.status(200).json({ place: rowToPlaceDTO(upserted) });
  } catch (err) {
    next(err);
  }
});
