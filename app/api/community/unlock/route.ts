import { apiError, cleanText, ensureDevice, ensureSeedCards, validDeviceId } from "../../_lib/server";
import { getD1 } from "@/db";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!validDeviceId(body.deviceId)) return apiError("Appareil invalide.");
    const code = cleanText(body.code, 120).toUpperCase();
    if (!code) return apiError("QR code invalide.");
    await ensureDevice(body.deviceId);
    await ensureSeedCards();
    const db = getD1();
    const card = await db.prepare("SELECT id FROM city_cards WHERE qr_code = ? AND status = 'approved'")
      .bind(code).first<{ id: string }>();
    if (!card) return apiError("Ce QR code n’est pas reconnu.", 404);
    await db.prepare(`
      INSERT OR IGNORE INTO collected_cards (card_id, device_id, method, collected_at)
      VALUES (?, ?, 'qr', ?)
    `).bind(card.id, body.deviceId, Date.now()).run();
    return Response.json({ cardId: card.id });
  } catch (error) {
    console.error("community.unlock", error);
    return apiError("Impossible de vérifier ce QR code.", 500);
  }
}
