import { apiError, cleanText, ensureDevice, ensureSeedCards, finiteNumber, validDeviceId } from "../_lib/server";
import { getD1 } from "@/db";

export async function GET() {
  try {
    await ensureSeedCards();
    const result = await getD1().prepare(`
      SELECT c.id, c.city, c.title, c.description, c.icon, c.tone, c.image_key,
             c.latitude, c.longitude, c.unlock_radius_m, c.challenge_distance_m,
             c.status, c.created_at, COUNT(v.card_id) AS votes
      FROM city_cards c
      LEFT JOIN card_votes v ON v.card_id = c.id
      WHERE c.status IN ('approved', 'proposed')
      GROUP BY c.id
      ORDER BY CASE c.status WHEN 'approved' THEN 0 ELSE 1 END, votes DESC, c.created_at DESC
      LIMIT 100
    `).all();
    return Response.json({ cards: result.results }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    console.error("community.get", error);
    return apiError("Impossible de charger les cartes communautaires.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!validDeviceId(body.deviceId)) return apiError("Appareil invalide.");
    const id = cleanText(body.id, 100);
    const city = cleanText(body.city, 80);
    const title = cleanText(body.title, 100);
    const description = cleanText(body.description, 600);
    if (!id || !city || title.length < 3 || description.length < 10) return apiError("Proposition incomplète.");
    await ensureDevice(body.deviceId);
    await getD1().prepare(`
      INSERT OR IGNORE INTO city_cards
        (id, city, title, description, icon, tone, image_key, latitude, longitude,
         unlock_radius_m, status, author_device_id, created_at)
      VALUES (?, ?, ?, ?, '✦', 'green', ?, ?, ?, 50, 'proposed', ?, ?)
    `).bind(
      id, city, title, description, cleanText(body.imageKey, 220) || null,
      finiteNumber(body.latitude, -90, 90), finiteNumber(body.longitude, -180, 180),
      body.deviceId, Date.now(),
    ).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("community.post", error);
    return apiError("Impossible d’enregistrer cette proposition.", 500);
  }
}
