import { apiError, cleanText, ensureDevice, validDeviceId } from "../../_lib/server";
import { getD1 } from "@/db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!validDeviceId(body.deviceId)) return apiError("Appareil invalide.");
    const cardId = cleanText(body.cardId, 100);
    if (!cardId) return apiError("Carte invalide.");
    await ensureDevice(body.deviceId);
    const db = getD1();
    await db.prepare(`INSERT OR IGNORE INTO card_votes (card_id, device_id, created_at) VALUES (?, ?, ?)`)
      .bind(cardId, body.deviceId, Date.now()).run();
    const count = await db.prepare(`SELECT COUNT(*) AS votes FROM card_votes WHERE card_id = ?`).bind(cardId).first<{ votes: number }>();
    if ((count?.votes ?? 0) >= 25) {
      await db.prepare(`UPDATE city_cards SET status = 'approved' WHERE id = ? AND status = 'proposed'`).bind(cardId).run();
    }
    return Response.json({ ok: true, votes: count?.votes ?? 0 });
  } catch (error) {
    console.error("community.vote", error);
    return apiError("Impossible d’enregistrer le vote.", 500);
  }
}
