import type { CityCard, Point, Trip } from "./types";

export const PARIS = { lat: 48.85682, lng: 2.34965 };
export const GPS_INTERVAL = 5_000;
export const REVEAL_DISTANCE = 38;

export const demoPath: Point[] = [
  [48.85635, 2.3471], [48.85652, 2.34775], [48.85676, 2.34835],
  [48.85692, 2.3491], [48.85702, 2.34985], [48.85688, 2.35062],
  [48.85662, 2.35127], [48.85631, 2.35186], [48.85598, 2.3523],
].map(([lat, lng], index) => ({
  lat,
  lng,
  ts: Date.now() - (8 - index) * 18_000,
  speed: 1.32,
  heading: 82,
}));

export const initialTrips: Trip[] = [
  {
    id: "trip-demo-1",
    name: "Boucle des quais",
    city: "Paris 4e",
    startedAt: Date.now() - 86_400_000,
    duration: 2_580,
    distance: 3_420,
    circles: 31,
    points: demoPath,
  },
  {
    id: "trip-demo-2",
    name: "Marais au lever du jour",
    city: "Paris 3e",
    startedAt: Date.now() - 3 * 86_400_000,
    duration: 3_060,
    distance: 4_180,
    circles: 44,
    points: demoPath.map((point) => ({ ...point, lat: point.lat + 0.004, lng: point.lng - 0.002 })),
  },
  {
    id: "trip-demo-3",
    name: "Autour du Panthéon",
    city: "Paris 5e",
    startedAt: Date.now() - 6 * 86_400_000,
    duration: 1_740,
    distance: 2_310,
    circles: 24,
    points: demoPath.map((point) => ({ ...point, lat: point.lat - 0.006, lng: point.lng + 0.003 })),
  },
];

export const baseCards: CityCard[] = [
  {
    id: "card-passage",
    city: "Paris",
    title: "Les passages secrets",
    description: "Galeries vitrées, mosaïques et raccourcis cachés du Paris du XIXe siècle.",
    icon: "⌁",
    votes: 284,
    state: "locked",
    requirement: "Explorez les passages du 2e arrondissement",
    tone: "violet",
    latitude: 48.8718,
    longitude: 2.3403,
    unlockRadius: 60,
  },
  {
    id: "card-ourcq",
    city: "Paris",
    title: "L’eau sous la ville",
    description: "Suivez la trace invisible du canal de l’Ourcq jusqu’au cœur de Paris.",
    icon: "≈",
    votes: 197,
    state: "nearby",
    requirement: "À proximité · Approchez-vous",
    tone: "blue",
    latitude: 48.85702,
    longitude: 2.34985,
    unlockRadius: 75,
  },
  {
    id: "card-bievre",
    city: "Paris",
    title: "La Bièvre retrouvée",
    description: "Une rivière disparue, encore lisible dans les rues du 13e arrondissement.",
    icon: "◇",
    votes: 143,
    state: "locked",
    requirement: "Marchez 5 km dans Paris",
    tone: "amber",
    challengeDistance: 5_000,
  },
  {
    id: "card-toits",
    city: "Paris",
    title: "Les toits de zinc",
    description: "Cheminées, mansardes et silhouettes qui dessinent l’horizon parisien.",
    icon: "⌂",
    votes: 89,
    state: "proposal",
    requirement: "Proposition de Lila M.",
    tone: "rose",
  },
];
