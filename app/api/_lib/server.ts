import { getD1 } from "@/db";

const SEED_CARDS = [
  ["card-passage", "Paris", "Les passages secrets", "Galeries vitrées, mosaïques et raccourcis cachés du Paris du XIXe siècle.", "⌁", "violet", 48.8718, 2.3403, 60, null, "PARIS-PASSAGES", "approved", "worldexplorer"],
  ["card-ourcq", "Paris", "L’eau sous la ville", "Suivez la trace invisible du canal de l’Ourcq jusqu’au cœur de Paris.", "≈", "blue", 48.85702, 2.34985, 75, null, "PARIS-2026", "approved", "worldexplorer"],
  ["card-bievre", "Paris", "La Bièvre retrouvée", "Une rivière disparue, encore lisible dans les rues du 13e arrondissement.", "◇", "amber", null, null, 50, 5000, "PARIS-BIEVRE", "approved", "worldexplorer"],
  ["card-toits", "Paris", "Les toits de zinc", "Cheminées, mansardes et silhouettes qui dessinent l’horizon parisien.", "⌂", "rose", null, null, 50, null, "PARIS-TOITS", "proposed", "worldexplorer"],
] as const;

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 128 && /^[a-zA-Z0-9-]+$/.test(value);
}

export function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function finiteNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function ensureDevice(deviceId: string) {
  const db = getD1();
  const now = Date.now();
  await db.prepare(`
    INSERT INTO devices (id, display_name, created_at, last_seen_at)
    VALUES (?, 'Explorateur', ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).bind(deviceId, now, now).run();
}

export async function ensureSeedCards() {
  const db = getD1();
  await db.batch(SEED_CARDS.map((card) => db.prepare(`
    INSERT OR IGNORE INTO city_cards
      (id, city, title, description, icon, tone, latitude, longitude, unlock_radius_m,
       challenge_distance_m, qr_code, status, author_device_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(...card, 1_780_000_000_000)));
}
