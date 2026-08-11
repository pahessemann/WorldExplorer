import { deleteRecord, getDeviceId, queueOperation, readAll } from "./explorer/storage";
import type { CityCard, CloudState, Collection, Reveal, SyncOperation, Trip } from "./explorer/types";

type RemoteCard = {
  id: string;
  city: string;
  title: string;
  description: string;
  icon: string;
  tone: string;
  image_key: string | null;
  latitude: number | null;
  longitude: number | null;
  unlock_radius_m: number;
  challenge_distance_m: number | null;
  status: "approved" | "proposed";
  votes: number;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erreur réseau (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function sendProgress(kind: "circle" | "trip" | "collection", payload: unknown) {
  const key = kind === "circle" ? "circles" : kind === "trip" ? "trips" : "collections";
  await requestJson("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), [key]: [payload] }),
  });
}

async function performOperation(kind: SyncOperation["kind"], payload: unknown) {
  if (kind === "circle" || kind === "trip" || kind === "collection") return sendProgress(kind, payload);
  if (kind === "vote") {
    return requestJson("/api/community/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId(), cardId: payload }),
    });
  }
  const { card, file } = payload as { card: CityCard; file?: File };
  let imageKey: string | undefined;
  if (file) {
    const form = new FormData();
    form.set("deviceId", getDeviceId());
    form.set("image", file);
    const upload = await requestJson<{ key: string }>("/api/uploads", { method: "POST", body: form });
    imageKey = upload.key;
  }
  return requestJson("/api/community", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...card, deviceId: getDeviceId(), imageKey }),
  });
}

async function sendOrQueue(kind: SyncOperation["kind"], payload: unknown) {
  try {
    if (!navigator.onLine) throw new Error("offline");
    await performOperation(kind, payload);
    return true;
  } catch {
    await queueOperation(kind, payload);
    return false;
  }
}

export function syncCircle(circle: Reveal) { return sendOrQueue("circle", circle); }
export function syncTrip(trip: Trip) { return sendOrQueue("trip", trip); }
export function syncVote(cardId: string) { return sendOrQueue("vote", cardId); }
export function syncCollection(collection: Collection) { return sendOrQueue("collection", collection); }
export function syncProposal(card: CityCard, file?: File) { return sendOrQueue("proposal", { card, file }); }

export async function redeemQrCode(code: string) {
  const result = await requestJson<{ cardId: string }>("/api/community/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), code }),
  });
  return result.cardId;
}

export async function flushOutbox() {
  if (!navigator.onLine) return 0;
  const pending = (await readAll<SyncOperation>("outbox")).sort((a, b) => a.createdAt - b.createdAt).slice(0, 100);
  let sent = 0;
  for (const operation of pending) {
    try {
      await performOperation(operation.kind, operation.payload);
      await deleteRecord("outbox", operation.id);
      sent += 1;
    } catch {
      break;
    }
  }
  return sent;
}

export async function pullCommunityCards(): Promise<CityCard[]> {
  const { cards } = await requestJson<{ cards: RemoteCard[] }>("/api/community");
  return cards.map((card) => ({
    id: card.id,
    city: card.city,
    title: card.title,
    description: card.description,
    icon: card.icon,
    tone: card.tone,
    votes: Number(card.votes),
    state: card.status === "proposed" ? "proposal" : "locked",
    requirement: card.status === "proposed" ? "Vote communautaire" : "À découvrir sur place",
    image: card.image_key ? `/api/uploads/${card.image_key}` : undefined,
    latitude: card.latitude ?? undefined,
    longitude: card.longitude ?? undefined,
    unlockRadius: card.unlock_radius_m,
    challengeDistance: card.challenge_distance_m ?? undefined,
  }));
}

export async function pullCloudState(): Promise<CloudState> {
  const deviceId = getDeviceId();
  const remote = await requestJson<{
    circles: Array<{ id: string; latitude: number; longitude: number; radius_m: 50; explored_at: number }>;
    trips: Array<{ id: string; name: string; city: string; started_at: number; duration_seconds: number; distance_m: number; circles_count: number; points_json: string }>;
    collections: Array<{ card_id: string; method: Collection["method"]; collected_at: number }>;
  }>(`/api/sync?deviceId=${encodeURIComponent(deviceId)}`);
  return {
    circles: remote.circles.map((item) => ({ id: item.id, lat: item.latitude, lng: item.longitude, radius: 50, createdAt: item.explored_at })),
    trips: remote.trips.map((item) => ({ id: item.id, name: item.name, city: item.city, startedAt: item.started_at, duration: item.duration_seconds, distance: item.distance_m, circles: item.circles_count, points: JSON.parse(item.points_json) })),
    collections: remote.collections.map((item) => ({ id: `${item.card_id}-${item.collected_at}`, cardId: item.card_id, method: item.method, collectedAt: item.collected_at })),
  };
}
