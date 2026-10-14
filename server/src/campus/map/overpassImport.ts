import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * OpenStreetMap Overpass API Import Script for IIT Mandi Campus (Section 13)
 *
 * Usage:
 *   npx tsx server/src/campus/map/overpassImport.ts
 *
 * Queries OpenStreetMap for buildings, hostels, amenities, and footways inside the
 * IIT Mandi Kamand bounding box and writes an updated overlay file without inventing coordinates.
 */

const IIT_MANDI_BBOX = '31.7680,76.9780,31.7850,76.9960'; // south,west,north,east

const OVERPASS_QUERY = `
[out:json][timeout:25];
(
  node["building"](${IIT_MANDI_BBOX});
  way["building"](${IIT_MANDI_BBOX});
  node["amenity"](${IIT_MANDI_BBOX});
  way["amenity"](${IIT_MANDI_BBOX});
  way["highway"~"footway|path|pedestrian|steps|residential"](${IIT_MANDI_BBOX});
);
out body center;
`;

async function runOverpassImport() {
  console.log('Querying OpenStreetMap Overpass API for IIT Mandi Kamand campus...');
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'KamandChat-OSM-Importer/1.0',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    elements?: Array<{
      id: number;
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const features = (data.elements ?? [])
    .filter((el) => (el.lat && el.lon) || el.center)
    .map((el) => {
      const lat = el.lat ?? el.center!.lat;
      const lng = el.lon ?? el.center!.lon;
      const name = el.tags?.name || el.tags?.ref || `OSM-${el.id}`;
      return {
        type: 'Feature',
        properties: {
          id: `osm-${el.type}-${el.id}`,
          canonicalName: name,
          tags: el.tags ?? {},
          isPlaceholderCoord: false,
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      };
    });

  const outPath = path.resolve(process.cwd(), 'src/campus/map/osm-imported.geojson');
  await fs.writeFile(
    outPath,
    JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    'utf8'
  );
  console.log(`Imported ${features.length} real OpenStreetMap features to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOverpassImport().catch((err) => {
    console.error('Overpass import failed:', err);
    process.exit(1);
  });
}
