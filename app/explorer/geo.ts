import type { Point, Reveal } from "./types";

export function distanceBetween(a: Pick<Point, "lat" | "lng">, b: Pick<Point, "lat" | "lng">) {
  const radius = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(haversine));
}

export function routeDistance(points: Point[]) {
  return points.reduce((sum, point, index) =>
    index ? sum + distanceBetween(points[index - 1], point) : sum, 0);
}

export function circleRing(circle: Reveal) {
  const points: [number, number][] = [];
  for (let angle = 0; angle <= 360; angle += 12) {
    const radians = (angle * Math.PI) / 180;
    const latitudeDelta = (circle.radius / 111_320) * Math.sin(radians);
    const longitudeDelta = (circle.radius / (111_320 * Math.cos((circle.lat * Math.PI) / 180))) * Math.cos(radians);
    points.push([circle.lat + latitudeDelta, circle.lng + longitudeDelta]);
  }
  return points;
}

export function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}

export function formatDistance(meters: number) {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}
