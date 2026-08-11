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

export type LngLat = [number, number];

export type RegionGeometry =
  | { type: "Polygon"; coordinates: LngLat[][] }
  | { type: "MultiPolygon"; coordinates: LngLat[][][] };

export type RegionBoundary = {
  id: "active-region";
  code: string;
  name: string;
  postcodes: string[];
  departmentCode: string;
  regionCode: string;
  countryCode: "250";
  continent: "Europe";
  geometry: RegionGeometry;
  areaM2: number;
  fetchedAt: number;
};

export type TerritoryLevel = "world" | "continent" | "country" | "region" | "department" | "commune";

export type ExplorationScope = {
  id: string;
  level: TerritoryLevel;
  code: string;
  name: string;
  areaM2: number;
  geometry?: RegionGeometry;
};

export type ExplorationZoneModel = {
  rings: Array<Array<[number, number]>>;
  areaM2: number;
  cellCount: number;
};

export type RegionalCollectible = {
  id: string;
  regionCode: string;
  title: string;
  icon: string;
  lat: number;
  lng: number;
  unlockRadius: number;
};

export type CollectibleDiscovery = {
  id: string;
  regionCode: string;
  collectedAt: number;
};

export type SyncOperation = {
  id: string;
  kind: "circle" | "trip" | "proposal" | "vote" | "collection" | "discovery";
  payload: unknown;
  createdAt: number;
  attempts: number;
};

export type CloudState = {
  circles: Reveal[];
  trips: Trip[];
  collections: Collection[];
  discoveries: CollectibleDiscovery[];
};
