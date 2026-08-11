import type { ExplorationZoneModel, Reveal } from "./types";

const EARTH_RADIUS = 6_378_137;
const GRID_SIZE = 18;

type GridPoint = [number, number];
type Edge = { start: string; end: string };

function project(lat: number, lng: number) {
  const latitude = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return {
    x: EARTH_RADIUS * lng * Math.PI / 180,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude / 2)),
    scale: 1 / Math.cos(latitude),
  };
}

function unproject(x: number, y: number): [number, number] {
  const lng = x / EARTH_RADIUS * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI;
  return [lat, lng];
}

function key(x: number, y: number) {
  return `${x}:${y}`;
}

function parseKey(value: string): GridPoint {
  const [x, y] = value.split(":").map(Number);
  return [x, y];
}

function simplifyGridRing(points: GridPoint[]) {
  if (points.length < 4) return points;
  const simplified: GridPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const collinear = (previous[0] === current[0] && current[0] === next[0])
      || (previous[1] === current[1] && current[1] === next[1]);
    if (!collinear) simplified.push(current);
  }
  return simplified;
}

function smoothRing(points: Array<[number, number]>) {
  let smoothed = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const next: Array<[number, number]> = [];
    for (let index = 0; index < smoothed.length; index += 1) {
      const current = smoothed[index];
      const following = smoothed[(index + 1) % smoothed.length];
      next.push([
        current[0] * 0.75 + following[0] * 0.25,
        current[1] * 0.75 + following[1] * 0.25,
      ]);
      next.push([
        current[0] * 0.25 + following[0] * 0.75,
        current[1] * 0.25 + following[1] * 0.75,
      ]);
    }
    smoothed = next;
  }
  return smoothed;
}

function traceRings(cells: Set<string>) {
  const edges: Edge[] = [];
  const addEdge = (startX: number, startY: number, endX: number, endY: number) => {
    edges.push({ start: key(startX, startY), end: key(endX, endY) });
  };

  cells.forEach((cell) => {
    const [x, y] = parseKey(cell);
    if (!cells.has(key(x, y + 1))) addEdge(x, y + 1, x + 1, y + 1);
    if (!cells.has(key(x + 1, y))) addEdge(x + 1, y + 1, x + 1, y);
    if (!cells.has(key(x, y - 1))) addEdge(x + 1, y, x, y);
    if (!cells.has(key(x - 1, y))) addEdge(x, y, x, y + 1);
  });

  const outgoing = new Map<string, Edge[]>();
  edges.forEach((edge) => outgoing.set(edge.start, [...(outgoing.get(edge.start) ?? []), edge]));
  const unused = new Set(edges.map((edge) => `${edge.start}>${edge.end}`));
  const rings: GridPoint[][] = [];

  for (const first of edges) {
    if (!unused.has(`${first.start}>${first.end}`)) continue;
    const ring: GridPoint[] = [parseKey(first.start)];
    let edge = first;
    for (let guard = 0; guard < edges.length + 1; guard += 1) {
      unused.delete(`${edge.start}>${edge.end}`);
      if (edge.end === first.start) break;
      ring.push(parseKey(edge.end));
      const candidates = (outgoing.get(edge.end) ?? []).filter((candidate) => unused.has(`${candidate.start}>${candidate.end}`));
      if (!candidates.length) break;
      edge = candidates[0];
    }
    if (ring.length >= 4) rings.push(simplifyGridRing(ring));
  }
  return rings;
}

export function mergeRevealCircles(circles: Reveal[]): ExplorationZoneModel {
  if (!circles.length) return { rings: [], areaM2: 0, cellCount: 0 };
  const cells = new Set<string>();

  for (const circle of circles) {
    const center = project(circle.lat, circle.lng);
    const projectedRadius = circle.radius * center.scale;
    const minX = Math.floor((center.x - projectedRadius) / GRID_SIZE);
    const maxX = Math.floor((center.x + projectedRadius) / GRID_SIZE);
    const minY = Math.floor((center.y - projectedRadius) / GRID_SIZE);
    const maxY = Math.floor((center.y + projectedRadius) / GRID_SIZE);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const sampleX = (x + 0.5) * GRID_SIZE;
        const sampleY = (y + 0.5) * GRID_SIZE;
        if ((sampleX - center.x) ** 2 + (sampleY - center.y) ** 2 <= projectedRadius ** 2) cells.add(key(x, y));
      }
    }
  }

  let areaM2 = 0;
  cells.forEach((cell) => {
    const [, y] = parseKey(cell);
    const lat = unproject(0, (y + 0.5) * GRID_SIZE)[0] * Math.PI / 180;
    areaM2 += GRID_SIZE * GRID_SIZE * Math.cos(lat) ** 2;
  });

  const rings = traceRings(cells).map((ring) => smoothRing(ring.map(([x, y]) => unproject(x * GRID_SIZE, y * GRID_SIZE))));
  return { rings, areaM2, cellCount: cells.size };
}
