type SyncableCircle = { id: string; lat: number; lng: number; radius: number; createdAt: number };
type SyncableTrip = { id: string; name: string; city: string; startedAt: number; duration: number; distance: number; circles: number; points: unknown[] };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type CommunityCard = {
  id: string;
  city: string;
  title: string;
  description: string;
  votes: number;
  status: string;
};

function deviceId() {
  const stored = window.localStorage.getItem("worldexplorer-device");
  if (stored) return stored;
  const created = crypto.randomUUID();
  window.localStorage.setItem("worldexplorer-device", created);
  return created;
}

async function write(table: string, payload: unknown, resolution = "ignore-duplicates") {
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: `resolution=${resolution},return=minimal`,
    },
    body: JSON.stringify(payload),
  });
}

export function syncCircle(circle: SyncableCircle) {
  return write("explored_circles", {
    id: circle.id,
    device_id: deviceId(),
    latitude: circle.lat,
    longitude: circle.lng,
    radius_m: circle.radius,
    explored_at: new Date(circle.createdAt).toISOString(),
  });
}

export function syncTrip(trip: SyncableTrip) {
  return write("trips", {
    id: trip.id,
    device_id: deviceId(),
    name: trip.name,
    city: trip.city,
    started_at: new Date(trip.startedAt).toISOString(),
    duration_seconds: trip.duration,
    distance_m: trip.distance,
    circles_count: trip.circles,
    points: trip.points,
  });
}

export function syncVote(cardId: string) {
  return write("card_votes", { card_id: cardId, device_id: deviceId() });
}

export function syncProposal(card: { id: string; city: string; title: string; description: string }) {
  return write("city_cards", {
    id: card.id,
    city: card.city,
    title: card.title,
    description: card.description,
    status: "proposed",
    author_device_id: deviceId(),
  });
}

export async function pullCommunityCards(): Promise<CommunityCard[]> {
  if (!url || !key) return [];
  const response = await fetch(`${url}/rest/v1/city_card_scores?select=id,city,title,description,votes,status&order=votes.desc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return [];
  return response.json() as Promise<CommunityCard[]>;
}
