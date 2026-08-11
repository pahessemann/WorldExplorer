import { distanceBetween } from "./geo";
import type { ExplorationScope, LngLat, Point, RegionBoundary, RegionGeometry, RegionalCollectible, Reveal } from "./types";

const EARTH_RADIUS = 6_378_137;

type RegionFeature = {
  type: "Feature";
  properties: { code?: string; nom?: string; codesPostaux?: string[]; codeDepartement?: string; codeRegion?: string };
  geometry: RegionGeometry;
};

function ringArea(ring: LngLat[]) {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lng1, lat1] = ring[index];
    const [lng2, lat2] = ring[(index + 1) % ring.length];
    area += ((lng2 - lng1) * Math.PI / 180)
      * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return area * EARTH_RADIUS * EARTH_RADIUS / 2;
}

function polygonArea(rings: LngLat[][]) {
  if (!rings.length) return 0;
  return Math.max(0, Math.abs(ringArea(rings[0]))
    - rings.slice(1).reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0));
}

export function geometryArea(geometry: RegionGeometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

function pointInRing(point: Pick<Point, "lat" | "lng">, ring: LngLat[]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLng, currentLat] = ring[current];
    const [previousLng, previousLat] = ring[previous];
    const crosses = (currentLat > point.lat) !== (previousLat > point.lat)
      && point.lng < ((previousLng - currentLng) * (point.lat - currentLat))
        / (previousLat - currentLat || Number.EPSILON) + currentLng;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Pick<Point, "lat" | "lng">, polygon: LngLat[][]) {
  return Boolean(polygon[0] && pointInRing(point, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(point, hole)));
}

export function pointInGeometry(point: Pick<Point, "lat" | "lng">, geometry: RegionGeometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

export function geometryBounds(geometry: RegionGeometry) {
  const points = (geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2));
  return points.reduce((bounds, [lng, lat]) => ({
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
  }), { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity });
}

export async function fetchRegionAt(point: Pick<Point, "lat" | "lng">): Promise<RegionBoundary> {
  const query = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
    fields: "nom,code,codesPostaux,codeDepartement,codeRegion",
    format: "geojson",
    geometry: "contour",
  });
  const response = await fetch(`https://geo.api.gouv.fr/communes?${query}`);
  if (!response.ok) throw new Error("Territoire indisponible");
  const collection = await response.json() as { features?: RegionFeature[] };
  const feature = collection.features?.[0];
  if (!feature?.geometry || !feature.properties.code || !feature.properties.nom) {
    throw new Error("Aucune commune trouvée à cette position");
  }
  return {
    id: "active-region",
    code: feature.properties.code,
    name: feature.properties.nom,
    postcodes: feature.properties.codesPostaux ?? [],
    departmentCode: feature.properties.codeDepartement ?? feature.properties.code.slice(0, 2),
    regionCode: feature.properties.codeRegion ?? "11",
    countryCode: "250",
    continent: "Europe",
    geometry: feature.geometry,
    areaM2: geometryArea(feature.geometry),
    fetchedAt: Date.now(),
  };
}

async function fetchFrenchBoundary(level: "department" | "region", code: string): Promise<ExplorationScope> {
  const resource = level === "department" ? "departements" : "regions";
  const query = new URLSearchParams({ fields: "nom,code", format: "geojson", geometry: "contour" });
  const response = await fetch(`https://geo.api.gouv.fr/${resource}/${encodeURIComponent(code)}?${query}`);
  if (!response.ok) throw new Error("Découpage administratif indisponible");
  const payload = await response.json() as RegionFeature | { features?: RegionFeature[] };
  const feature = (payload as { features?: RegionFeature[] }).features?.[0] ?? (payload as RegionFeature);
  if (!feature?.geometry || !feature.properties.nom) throw new Error("Contour administratif introuvable");
  return {
    id: `scope-${level}-${code}`,
    level,
    code,
    name: feature.properties.nom,
    geometry: feature.geometry,
    areaM2: geometryArea(feature.geometry),
  };
}

export async function loadFrenchScopes(commune: RegionBoundary) {
  const [department, administrativeRegion] = await Promise.all([
    fetchFrenchBoundary("department", commune.departmentCode),
    fetchFrenchBoundary("region", commune.regionCode),
  ]);
  const communeScope: ExplorationScope = {
    id: `scope-commune-${commune.code}`,
    level: "commune",
    code: commune.postcodes[0] ?? commune.code,
    name: commune.name,
    geometry: commune.geometry,
    areaM2: commune.areaM2,
  };
  return { commune: communeScope, department, region: administrativeRegion };
}

function seededRandom(seedText: string) {
  let seed = [...seedText].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const collectibleKinds = [
  ["Curiosité locale", "?"],
  ["Éclat du territoire", "✦"],
  ["Balise d’exploration", "◇"],
  ["Souvenir de passage", "◎"],
] as const;

export function generateRegionCollectibles(region: RegionBoundary): RegionalCollectible[] {
  const bounds = geometryBounds(region.geometry);
  const random = seededRandom(region.code);
  const count = Math.min(16, Math.max(7, Math.round(7 + Math.sqrt(region.areaM2 / 1_000_000) * 0.6)));
  const minimumSpacing = Math.max(180, Math.sqrt(region.areaM2 / count) * 0.28);
  const points: Array<{ lat: number; lng: number }> = [];
  const centre = { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 };
  if (pointInGeometry(centre, region.geometry)) points.push(centre);

  for (let attempt = 0; attempt < 4_000 && points.length < count; attempt += 1) {
    const candidate = {
      lat: bounds.minLat + random() * (bounds.maxLat - bounds.minLat),
      lng: bounds.minLng + random() * (bounds.maxLng - bounds.minLng),
    };
    if (!pointInGeometry(candidate, region.geometry)) continue;
    if (points.some((point) => distanceBetween(point, candidate) < minimumSpacing)) continue;
    points.push(candidate);
  }

  return points.map((point, index) => ({
    id: `region-${region.code}-${index + 1}`,
    regionCode: region.code,
    title: collectibleKinds[index % collectibleKinds.length][0],
    icon: collectibleKinds[index % collectibleKinds.length][1],
    lat: point.lat,
    lng: point.lng,
    unlockRadius: 120,
  }));
}

export function exploredRegionPercent(region: RegionBoundary, circles: Reveal[]) {
  return exploredGeometryPercent(region.geometry, region.areaM2, circles);
}

function exploredGeometryPercent(geometry: RegionGeometry, areaM2: number, circles: Reveal[]) {
  if (!areaM2 || !circles.length) return 0;
  const bounds = geometryBounds(geometry);
  const referenceLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerLng = 111_320 * Math.cos(referenceLat * Math.PI / 180);
  const cellSize = 25;
  const visited = new Set<string>();

  for (const circle of circles) {
    if (circle.lat < bounds.minLat - 0.001 || circle.lat > bounds.maxLat + 0.001
      || circle.lng < bounds.minLng - 0.001 || circle.lng > bounds.maxLng + 0.001) continue;
    const centerX = circle.lng * metersPerLng;
    const centerY = circle.lat * 111_320;
    const minX = Math.floor((centerX - circle.radius) / cellSize);
    const maxX = Math.floor((centerX + circle.radius) / cellSize);
    const minY = Math.floor((centerY - circle.radius) / cellSize);
    const maxY = Math.floor((centerY + circle.radius) / cellSize);
    for (let gridX = minX; gridX <= maxX; gridX += 1) {
      for (let gridY = minY; gridY <= maxY; gridY += 1) {
        const sample = {
          lng: ((gridX + 0.5) * cellSize) / metersPerLng,
          lat: ((gridY + 0.5) * cellSize) / 111_320,
        };
        if (distanceBetween(circle, sample) <= circle.radius && pointInGeometry(sample, geometry)) {
          visited.add(`${gridX}:${gridY}`);
        }
      }
    }
  }
  return Math.min(100, visited.size * cellSize * cellSize / areaM2 * 100);
}

export function exploredScopePercent(scope: ExplorationScope, circles: Reveal[], mergedAreaM2: number) {
  if (!scope.areaM2) return 0;
  if (!scope.geometry) return Math.min(100, mergedAreaM2 / scope.areaM2 * 100);
  return exploredGeometryPercent(scope.geometry, scope.areaM2, circles);
}
