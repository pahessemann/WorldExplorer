export type Tab = "map" | "trips" | "cities" | "profile";

export type Point = {
  lat: number;
  lng: number;
  ts: number;
  speed: number;
  heading: number;
};

export type Reveal = {
  id: string;
  lat: number;
  lng: number;
  radius: 50;
  createdAt: number;
};

export type Trip = {
  id: string;
  name: string;
  city: string;
  startedAt: number;
  duration: number;
  distance: number;
  circles: number;
  points: Point[];
};

export type CityCardState = "collected" | "nearby" | "locked" | "proposal";

export type CityCard = {
  id: string;
  city: string;
  title: string;
  description: string;
  icon: string;
  votes: number;
  state: CityCardState;
  requirement: string;
  tone: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  unlockRadius?: number;
  challengeDistance?: number;
};

export type Collection = {
  id: string;
  cardId: string;
  collectedAt: number;
  method: "gps" | "qr" | "challenge";
};

export type SyncOperation = {
  id: string;
  kind: "circle" | "trip" | "proposal" | "vote" | "collection";
  payload: unknown;
  createdAt: number;
  attempts: number;
};

export type CloudState = {
  circles: Reveal[];
  trips: Trip[];
  collections: Collection[];
};
