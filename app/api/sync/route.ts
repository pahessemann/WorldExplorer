import { apiError, cleanText, ensureDevice, finiteNumber, validDeviceId } from "../_lib/server";
import { getD1 } from "@/db";

type Payload = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const deviceId = new URL(request.url).searchParams.get("deviceId");
    if (!validDeviceId(deviceId)) return apiError("Appareil invalide.");
    await ensureDevice(deviceId);
    const db = getD1();
    const [circles, trips, collections, discoveries] = await Promise.all([
      db.prepare(`SELECT id, latitude, longitude, radius_m, explored_at FROM explored_circles WHERE device_id = ? ORDER BY explored_at ASC LIMIT 10000`).bind(deviceId).all(),
      db.prepare(`SELECT id, name, city, started_at, duration_seconds, distance_m, circles_count, points_json FROM trips WHERE device_id = ? ORDER BY started_at DESC LIMIT 500`).bind(deviceId).all(),
      db.prepare(`SELECT card_id, method, collected_at FROM collected_cards WHERE device_id = ? ORDER BY collected_at DESC LIMIT 500`).bind(deviceId).all(),
      db.prepare(`SELECT collectible_id, region_code, collected_at FROM regional_discoveries WHERE device_id = ? ORDER BY collected_at DESC LIMIT 2000`).bind(deviceId).all(),
    ]);
    return Response.json({ circles: circles.results, trips: trips.results, collections: collections.results, discoveries: discoveries.results });
  } catch (error) {
    console.error("sync.get", error);
    return apiError("Impossible de récupérer la progression.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Payload;
    if (!validDeviceId(body.deviceId)) return apiError("Appareil invalide.");
    const circles = Array.isArray(body.circles) ? body.circles.slice(0, 500) as Payload[] : [];
    const trips = Array.isArray(body.trips) ? body.trips.slice(0, 50) as Payload[] : [];
    const collections = Array.isArray(body.collections) ? body.collections.slice(0, 100) as Payload[] : [];
    const discoveries = Array.isArray(body.discoveries) ? body.discoveries.slice(0, 200) as Payload[] : [];
    if (!circles.length && !trips.length && !collections.length && !discoveries.length) return apiError("Aucune donnée à synchroniser.");
    await ensureDevice(body.deviceId);
    const db = getD1();
    const statements: D1PreparedStatement[] = [];

    for (const circle of circles) {
      const id = cleanText(circle.id, 120);
      const latitude = finiteNumber(circle.lat, -90, 90);
      const longitude = finiteNumber(circle.lng, -180, 180);
      const exploredAt = finiteNumber(circle.createdAt, 1, Date.now() + 86_400_000);
      if (!id || latitude === null || longitude === null || exploredAt === null) continue;
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO explored_circles (id, device_id, latitude, longitude, radius_m, explored_at)
        VALUES (?, ?, ?, ?, 50, ?)
      `).bind(id, body.deviceId, latitude, longitude, exploredAt));
    }

    for (const trip of trips) {
      const id = cleanText(trip.id, 120);
      const name = cleanText(trip.name, 100);
      const city = cleanText(trip.city, 80);
      const points = Array.isArray(trip.points) ? trip.points.slice(0, 20_000) : [];
      const pointsJson = JSON.stringify(points);
      if (!id || !name || !city || pointsJson.length > 1_000_000) continue;
      statements.push(db.prepare(`
        INSERT OR REPLACE INTO trips
          (id, device_id, name, city, started_at, duration_seconds, distance_m, circles_count, points_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, body.deviceId, name, city,
        finiteNumber(trip.startedAt, 1, Date.now() + 86_400_000) ?? Date.now(),
        Math.round(finiteNumber(trip.duration, 0, 31_536_000) ?? 0),
        finiteNumber(trip.distance, 0, 100_000_000) ?? 0,
        Math.round(finiteNumber(trip.circles, 0, 1_000_000) ?? 0),
        pointsJson, Date.now(),
      ));
    }

    for (const collection of collections) {
      const cardId = cleanText(collection.cardId, 100);
      const method = ["gps", "qr", "challenge"].includes(String(collection.method)) ? String(collection.method) : "gps";
      if (!cardId) continue;
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO collected_cards (card_id, device_id, method, collected_at)
        VALUES (?, ?, ?, ?)
      `).bind(cardId, body.deviceId, method, finiteNumber(collection.collectedAt, 1, Date.now() + 86_400_000) ?? Date.now()));
    }

    for (const discovery of discoveries) {
      const collectibleId = cleanText(discovery.id, 120);
      const regionCode = cleanText(discovery.regionCode, 20);
      if (!collectibleId || !regionCode) continue;
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO regional_discoveries (collectible_id, device_id, region_code, collected_at)
        VALUES (?, ?, ?, ?)
      `).bind(collectibleId, body.deviceId, regionCode, finiteNumber(discovery.collectedAt, 1, Date.now() + 86_400_000) ?? Date.now()));
    }

    if (statements.length) await db.batch(statements);
    return Response.json({ ok: true, accepted: statements.length });
  } catch (error) {
    console.error("sync.post", error);
    return apiError("Impossible de synchroniser la progression.", 500);
  }
}
