"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pullCommunityCards, syncCircle, syncProposal, syncTrip, syncVote } from "./sync";

type Tab = "map" | "trips" | "cities" | "profile";
type Point = { lat: number; lng: number; ts: number; speed: number; heading: number };
type Reveal = { id: string; lat: number; lng: number; radius: 50; createdAt: number };
type Trip = {
  id: string;
  name: string;
  city: string;
  startedAt: number;
  duration: number;
  distance: number;
  circles: number;
  points: Point[];
};
type CityCard = {
  id: string;
  city: string;
  title: string;
  description: string;
  icon: string;
  votes: number;
  state: "collected" | "nearby" | "locked" | "proposal";
  requirement: string;
  tone: string;
  image?: string;
};

declare global {
  interface Window {
    L?: Record<string, (...args: unknown[]) => unknown>;
  }
}

const PARIS = { lat: 48.85682, lng: 2.34965 };
const GPS_INTERVAL = 5_000;
const REVEAL_DISTANCE = 38;

const demoPath: Point[] = [
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

const initialTrips: Trip[] = [
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
    points: demoPath.map((p) => ({ ...p, lat: p.lat + 0.004, lng: p.lng - 0.002 })),
  },
  {
    id: "trip-demo-3",
    name: "Autour du Panthéon",
    city: "Paris 5e",
    startedAt: Date.now() - 6 * 86_400_000,
    duration: 1_740,
    distance: 2_310,
    circles: 24,
    points: demoPath.map((p) => ({ ...p, lat: p.lat - 0.006, lng: p.lng + 0.003 })),
  },
];

const baseCards: CityCard[] = [
  {
    id: "card-passage",
    city: "Paris",
    title: "Les passages secrets",
    description: "Galeries vitrées, mosaïques et raccourcis cachés du Paris du XIXe siècle.",
    icon: "⌁",
    votes: 284,
    state: "collected",
    requirement: "Collectionnée rue Vivienne",
    tone: "violet",
  },
  {
    id: "card-ourcq",
    city: "Paris",
    title: "L’eau sous la ville",
    description: "Suivez la trace invisible du canal de l’Ourcq jusqu’au cœur de Paris.",
    icon: "≈",
    votes: 197,
    state: "nearby",
    requirement: "À 320 m · Approchez-vous",
    tone: "blue",
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

function distanceBetween(a: Pick<Point, "lat" | "lng">, b: Pick<Point, "lat" | "lng">) {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function routeDistance(points: Point[]) {
  return points.reduce((sum, point, index) =>
    index ? sum + distanceBetween(points[index - 1], point) : sum, 0);
}

function circleRing(circle: Reveal) {
  const points: [number, number][] = [];
  for (let angle = 0; angle <= 360; angle += 12) {
    const rad = (angle * Math.PI) / 180;
    const dLat = (circle.radius / 111_320) * Math.sin(rad);
    const dLng = (circle.radius / (111_320 * Math.cos((circle.lat * Math.PI) / 180))) * Math.cos(rad);
    points.push([circle.lat + dLat, circle.lng + dLng]);
  }
  return points;
}

const DB_NAME = "worldexplorer";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("circles")) db.createObjectStore("circles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("trips")) db.createObjectStore("trips", { keyPath: "id" });
      if (!db.objectStoreNames.contains("proposals")) db.createObjectStore("proposals", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut<T>(store: string, value: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-leaflet]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "anonymous";
    script.dataset.leaflet = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet indisponible"));
    document.head.appendChild(script);
  });
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}

function formatDistance(meters: number) {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}

function NavIcon({ name }: { name: Tab }) {
  return <span className={`nav-glyph nav-glyph-${name}`} aria-hidden="true" />;
}

export function ExplorerApp() {
  const [tab, setTab] = useState<Tab>("map");
  const [circles, setCircles] = useState<Reveal[]>([]);
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [route, setRoute] = useState<Point[]>([]);
  const [position, setPosition] = useState<Point | null>(null);
  const [tracking, setTracking] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [heading, setHeading] = useState(82);
  const [gpsState, setGpsState] = useState<"ready" | "asking" | "live" | "blocked">("ready");
  const [toast, setToast] = useState("Vos explorations sont enregistrées sur cet appareil");
  const [cards, setCards] = useState<CityCard[]>(baseCards);
  const [voted, setVoted] = useState<string[]>([]);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<unknown>(null);
  const layersRef = useRef<Record<string, unknown>>({});
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const lastGpsRef = useRef(0);
  const demoIndexRef = useRef(0);

  useEffect(() => {
    Promise.all([dbAll<Reveal>("circles"), dbAll<Trip>("trips"), dbAll<CityCard>("proposals")])
      .then(([savedCircles, savedTrips, proposals]) => {
        if (savedCircles.length) setCircles(savedCircles);
        else {
          const seeded = demoPath.slice(0, 7).map((point, index) => ({
            id: `reveal-demo-${index}`,
            lat: point.lat,
            lng: point.lng,
            radius: 50 as const,
            createdAt: point.ts,
          }));
          setCircles(seeded);
          seeded.forEach((circle) => void dbPut("circles", circle));
        }
        if (savedTrips.length) setTrips(savedTrips.sort((a, b) => b.startedAt - a.startedAt));
        else initialTrips.forEach((trip) => void dbPut("trips", trip));
        if (proposals.length) setCards((current) => [...current, ...proposals]);
      })
      .catch(() => setToast("Mode privé actif · stockage temporaire"));

    const votes = window.localStorage.getItem("worldexplorer-votes");
    if (votes) setVoted(JSON.parse(votes) as string[]);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    void pullCommunityCards().then((remote) => {
      if (!remote.length) return;
      setCards((current) => {
        const merged = new Map(current.map((card) => [card.id, card]));
        remote.forEach((card) => {
          const existing = merged.get(card.id);
          merged.set(card.id, existing ? { ...existing, votes: card.votes } : {
            ...card,
            icon: "✦",
            state: "proposal",
            requirement: "Proposition de la communauté",
            tone: "green",
          });
        });
        return [...merged.values()];
      });
    });

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, []);

  const revealPoint = useCallback((point: Point) => {
    setPosition(point);
    if (point.heading >= 0) setHeading(point.heading);
    setCircles((current) => {
      const nearest = current.reduce((min, circle) => Math.min(min, distanceBetween(circle, point)), Infinity);
      if (nearest < REVEAL_DISTANCE) return current;
      const next: Reveal = {
        id: `reveal-${point.ts}-${Math.round(point.lat * 100000)}`,
        lat: point.lat,
        lng: point.lng,
        radius: 50,
        createdAt: point.ts,
      };
      void dbPut("circles", next);
      void syncCircle(next);
      setToast("Nouvelle zone dévoilée · +50 m");
      return [...current, next];
    });
    if (tracking && point.ts - lastGpsRef.current >= GPS_INTERVAL) {
      lastGpsRef.current = point.ts;
      setRoute((current) => [...current, point]);
    }
  }, [tracking]);

  useEffect(() => {
    if (!tracking || demoMode || !navigator.geolocation) return;
    setGpsState("asking");
    const watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        setGpsState("live");
        revealPoint({
          lat: coords.latitude,
          lng: coords.longitude,
          ts: timestamp,
          speed: coords.speed ?? 0,
          heading: coords.heading ?? heading,
        });
      },
      () => {
        setGpsState("blocked");
        setToast("Position indisponible · essayez le parcours démo");
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tracking, demoMode, revealPoint, heading]);

  useEffect(() => {
    if (!tracking || !demoMode) return;
    const timer = window.setInterval(() => {
      const index = demoIndexRef.current % demoPath.length;
      const base = demoPath[index];
      revealPoint({ ...base, ts: Date.now(), speed: 1.25 + (index % 3) * 0.08 });
      demoIndexRef.current += 1;
    }, 1_800);
    return () => window.clearInterval(timer);
  }, [tracking, demoMode, revealPoint]);

  useEffect(() => {
    if (!tracking || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [tracking, startedAt]);

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const value = webkitHeading ?? (event.alpha == null ? null : 360 - event.alpha);
      if (value != null) setHeading(value);
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
    window.addEventListener("deviceorientation", onOrientation as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
    };
  }, []);

  useEffect(() => {
    if (tab !== "map" || !mapNodeRef.current) return;
    let cancelled = false;
    void loadLeaflet().then(() => {
      if (cancelled || !mapNodeRef.current || mapRef.current || !window.L) return;
      const L = window.L as unknown as {
        map: (node: HTMLElement, options: object) => { setView: (p: number[], z: number) => unknown; remove: () => void };
        tileLayer: (url: string, options: object) => { addTo: (map: unknown) => unknown };
        layerGroup: () => { addTo: (map: unknown) => { clearLayers: () => void } };
      };
      const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: false });
      map.setView([PARIS.lat, PARIS.lng], 16);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);
      mapRef.current = map;
      layersRef.current = {
        fog: L.layerGroup().addTo(map),
        reveals: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        marker: L.layerGroup().addTo(map),
      };
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
        layersRef.current = {};
        setMapReady(false);
      }
    };
  }, [tab]);

  useEffect(() => {
    if (!mapRef.current || !window.L || tab !== "map") return;
    const L = window.L as unknown as {
      polygon: (points: unknown, options: object) => { addTo: (layer: unknown) => unknown };
      circle: (point: number[], options: object) => { addTo: (layer: unknown) => unknown };
      polyline: (points: number[][], options: object) => { addTo: (layer: unknown) => unknown; getBounds: () => unknown };
      marker: (point: number[], options: object) => { addTo: (layer: unknown) => unknown };
      divIcon: (options: object) => unknown;
    };
    const layers = layersRef.current as Record<string, { clearLayers: () => void }>;
    Object.values(layers).forEach((layer) => layer.clearLayers());

    const world = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
    L.polygon([world, ...circles.map(circleRing)], {
      stroke: false,
      fillColor: "#060806",
      fillOpacity: 0.78,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(layers.fog);
    circles.forEach((circle) => {
      L.circle([circle.lat, circle.lng], {
        radius: 50,
        color: "#b8f34a",
        weight: 1,
        opacity: 0.32,
        fillColor: "#b8f34a",
        fillOpacity: 0.035,
        interactive: false,
      }).addTo(layers.reveals);
    });
    if (route.length > 1) {
      const line = L.polyline(route.map((p) => [p.lat, p.lng]), {
        color: "#d0ff66",
        weight: 5,
        opacity: 0.95,
        lineCap: "round",
      });
      line.addTo(layers.route);
    }
    const current = position ?? demoPath[demoPath.length - 1];
    L.marker([current.lat, current.lng], {
      icon: L.divIcon({
        className: "explorer-marker-wrap",
        html: `<span class="explorer-marker" style="transform:rotate(${heading}deg)"><i></i></span>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      }),
    }).addTo(layers.marker);
  }, [circles, route, position, heading, tab, mapReady]);

  const start = (demo = false) => {
    setDemoMode(demo);
    setRoute([]);
    setElapsed(0);
    setStartedAt(Date.now());
    setTracking(true);
    setGpsState(demo ? "live" : "asking");
    setToast(demo ? "Parcours démo lancé" : "Recherche du signal GPS…");
  };

  const stop = () => {
    if (route.length > 1 && startedAt) {
      const trip: Trip = {
        id: `trip-${Date.now()}`,
        name: demoMode ? "Exploration démo" : "Nouvelle exploration",
        city: "Paris",
        startedAt,
        duration: Math.max(elapsed, 1),
        distance: routeDistance(route),
        circles: route.length,
        points: route,
      };
      setTrips((current) => [trip, ...current]);
      void dbPut("trips", trip);
      void syncTrip(trip);
      setToast("Trajet enregistré dans votre historique");
    }
    setTracking(false);
    setDemoMode(false);
    setGpsState("ready");
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setToast("Ce navigateur ne propose pas la géolocalisation");
      return;
    }
    setGpsState("asking");
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        setGpsState("live");
        revealPoint({ lat: coords.latitude, lng: coords.longitude, ts: timestamp, speed: coords.speed ?? 0, heading: coords.heading ?? heading });
        const map = mapRef.current as { setView?: (p: number[], z: number) => void } | null;
        map?.setView?.([coords.latitude, coords.longitude], 17);
      },
      () => {
        setGpsState("blocked");
        setToast("GPS bloqué · autorisez la position ou lancez la démo");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const vote = (id: string) => {
    if (voted.includes(id)) return;
    const next = [...voted, id];
    setVoted(next);
    window.localStorage.setItem("worldexplorer-votes", JSON.stringify(next));
    setCards((current) => current.map((card) => card.id === id ? { ...card, votes: card.votes + 1 } : card));
    void syncVote(id);
    setToast("Vote enregistré · merci !");
  };

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("image");
    let image: string | undefined;
    if (file instanceof File && file.size) {
      image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    }
    const proposal: CityCard = {
      id: `proposal-${Date.now()}`,
      city: String(data.get("city") || "Paris"),
      title: String(data.get("title") || "Nouvelle découverte"),
      description: String(data.get("description") || "Une histoire à découvrir sur place."),
      icon: "✦",
      votes: 1,
      state: "proposal",
      requirement: "Votre proposition · en cours de vote",
      tone: "green",
      image,
    };
    setCards((current) => [...current, proposal]);
    void dbPut("proposals", proposal);
    void syncProposal(proposal);
    setProposalOpen(false);
    setToast("Votre carte est ouverte aux votes");
  };

  const showTrip = (trip: Trip) => {
    setRoute(trip.points);
    setSelectedTrip(trip.id);
    setTab("map");
    setToast(`${trip.name} affiché sur la carte`);
  };

  const exportTrips = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), trips, circles }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "worldexplorer-export.json";
    link.click();
    URL.revokeObjectURL(href);
    setToast("Archive d’exploration exportée");
  };

  const unlockQr = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim().toUpperCase();
    if (!code) return;
    setCards((current) => current.map((card) => card.id === "card-ourcq" ? { ...card, state: "collected", requirement: `Débloquée avec ${code}` } : card));
    setQrOpen(false);
    setToast("Carte « L’eau sous la ville » débloquée !");
  };

  const routeMeters = routeDistance(route);
  const speedKmh = ((position?.speed ?? 0) * 3.6);
  const totalDistance = trips.reduce((sum, trip) => sum + trip.distance, 0);
  const totalCircles = circles.length + trips.reduce((sum, trip) => sum + trip.circles, 0);
  const collected = cards.filter((card) => card.state === "collected").length;

  const tabTitle = useMemo(() => ({ map: "Explorer", trips: "Mes trajets", cities: "Cartes de villes", profile: "Profil" })[tab], [tab]);

  return (
    <main className={`app-shell tab-${tab}`}>
      <aside className="desktop-rail" aria-label="Navigation principale">
        <button className="brand" onClick={() => setTab("map")} aria-label="WorldExplorer, revenir à la carte">
          <span className="brand-mark"><i /></span>
          <span>WORLD<br /><b>EXPLORER</b></span>
        </button>
        <nav>
          {(["map", "trips", "cities", "profile"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} aria-label={({ map: "Carte", trips: "Trajets", cities: "Villes", profile: "Profil" })[item]}>
              <NavIcon name={item} />
              <span>{({ map: "Carte", trips: "Trajets", cities: "Villes", profile: "Profil" })[item]}</span>
            </button>
          ))}
        </nav>
        <div className="rail-level"><span>Niveau 8</span><b>72%</b><i><em /></i></div>
        <button className="rail-avatar" onClick={() => setTab("profile")}><span>PH</span><i className="online-dot" /></button>
      </aside>

      {tab === "map" && (
        <section className="map-screen" aria-label="Carte d’exploration">
          <div ref={mapNodeRef} className="map-canvas" aria-label="Carte de Paris avec zones explorées" />
          <div className="map-vignette" />
          <header className="map-topbar">
            <button className="mobile-brand" aria-label="WorldExplorer"><span className="brand-mark"><i /></span></button>
            <div className="place-pill">
              <span className="live-pulse" />
              <div><small>{gpsState === "live" ? "POSITION EN DIRECT" : "EXPLORATION DU JOUR"}</small><strong>Paris, France</strong></div>
              <button aria-label="Choisir une ville">⌄</button>
            </div>
            <button className="round-control avatar-control" onClick={() => setTab("profile")} aria-label="Ouvrir le profil">PH<span /></button>
          </header>

          <div className="map-actions">
            <button className="round-control" onClick={locate} aria-label="Me localiser"><span className="locate-icon" /></button>
            <button className="round-control compass-control" aria-label={`Direction ${Math.round(heading)} degrés`}><span style={{ transform: `rotate(${heading}deg)` }}>N</span></button>
            {!tracking && <button className="demo-chip" onClick={() => start(true)}>ESSAI DÉMO</button>}
          </div>

          <div className="discovery-card">
            <span className="discovery-icon">✦</span>
            <div><small>AUJOURD’HUI</small><strong>{Math.max(circles.length - 7, 7)} zones dévoilées</strong></div>
            <span className="gain">+{Math.max(80, circles.length * 10)} XP</span>
          </div>

          <div className="exploration-console">
            <div className="metric"><small>VITESSE</small><strong>{speedKmh.toFixed(1)}</strong><span>km/h</span></div>
            <div className="metric"><small>DISTANCE</small><strong>{routeMeters ? (routeMeters / 1000).toFixed(2) : "0.84"}</strong><span>km</span></div>
            <button className={`explore-button ${tracking ? "recording" : ""}`} onClick={() => tracking ? stop() : start(false)}>
              <span>{tracking ? "■" : "↗"}</span>
              <div><small>{tracking ? formatTime(elapsed) : "PRÊT À PARTIR"}</small><strong>{tracking ? "Terminer" : "Explorer"}</strong></div>
            </button>
            <div className="metric"><small>DURÉE</small><strong>{tracking ? formatTime(elapsed).replace(" min", "") : "12"}</strong><span>min</span></div>
            <div className="metric"><small>DÉVOILÉ</small><strong>{tracking ? route.length : "07"}</strong><span>zones</span></div>
          </div>
          {selectedTrip && <button className="history-pill" onClick={() => { setSelectedTrip(null); setRoute([]); }}>× Fermer le trajet affiché</button>}
          <div className={`toast ${toast ? "show" : ""}`} role="status"><span>✓</span>{toast}</div>
        </section>
      )}

      {tab === "trips" && (
        <section className="content-screen">
          <ContentHeader eyebrow="VOTRE JOURNAL" title={tabTitle} action="Exporter" onAction={exportTrips} />
          <div className="overview-grid">
            <article className="hero-stat lime-panel">
              <span className="stat-symbol">↗</span>
              <p>Distance totale</p><strong>{(totalDistance / 1000).toFixed(1)}<small> km</small></strong>
              <span className="trend">↗ 12% ce mois</span>
            </article>
            <article className="week-card">
              <div className="card-heading"><div><span>7 DERNIERS JOURS</span><strong>Votre rythme</strong></div><b>18,4 km</b></div>
              <div className="bar-chart" aria-label="Distance parcourue ces sept derniers jours">
                {[35, 62, 48, 82, 54, 100, 72].map((height, index) => <i key={index} style={{ height: `${height}%` }}><span>{["L", "M", "M", "J", "V", "S", "D"][index]}</span></i>)}
              </div>
            </article>
            <article className="mini-stat"><span>◷</span><div><small>TEMPS EN MOUVEMENT</small><strong>5 h 42</strong></div></article>
            <article className="mini-stat"><span>◎</span><div><small>ZONES DÉVOILÉES</small><strong>{totalCircles}</strong></div></article>
          </div>
          <div className="section-heading"><div><small>HISTORIQUE</small><h2>Explorations récentes</h2></div><button>Tout afficher</button></div>
          <div className="trip-list">
            {trips.map((trip, index) => (
              <article className="trip-row" key={trip.id}>
                <div className={`trip-map-preview route-${index % 3}`}><span>↗</span><i /></div>
                <div className="trip-main"><small>{new Date(trip.startedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</small><h3>{trip.name}</h3><p>⌖ {trip.city}</p></div>
                <div className="trip-metrics"><span><b>{formatDistance(trip.distance)}</b><small>DISTANCE</small></span><span><b>{formatTime(trip.duration)}</b><small>DURÉE</small></span><span><b>{((trip.distance / Math.max(trip.duration, 1)) * 3.6).toFixed(1)}</b><small>KM/H MOY.</small></span><span><b>{trip.circles}</b><small>ZONES</small></span></div>
                <button className="view-trip" onClick={() => showTrip(trip)}>Voir sur la carte <span>→</span></button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "cities" && (
        <section className="content-screen cities-screen">
          <ContentHeader eyebrow="COLLECTIONNER LE MONDE" title={tabTitle} action="Scanner un QR" onAction={() => setQrOpen(true)} />
          <div className="city-hero">
            <div className="city-art"><span>PARIS</span><i className="eiffel">A</i><em>48° 51′ N<br />2° 21′ E</em></div>
            <div className="city-progress">
              <span>VILLE ACTIVE</span><h2>Paris</h2><p>Chaque quartier cache une histoire. Explorez la ville pour compléter votre collection.</p>
              <div className="collection-count"><strong>12</strong><span>/ 18 cartes</span><b>67%</b></div>
              <i className="progress-track"><em style={{ width: "67%" }} /></i>
              <button onClick={() => setTab("map")}>Continuer l’exploration <span>↗</span></button>
            </div>
          </div>
          <div className="section-heading cards-heading"><div><small>COLLECTION DE PARIS</small><h2>Histoires à découvrir</h2></div><button onClick={() => setProposalOpen(true)}>+ Proposer une carte</button></div>
          <div className="city-card-grid">
            {cards.map((card) => (
              <article className={`city-card ${card.tone} state-${card.state}`} key={card.id}>
                <div className="card-art" style={card.image ? { backgroundImage: `linear-gradient(rgba(16,18,16,.18), rgba(16,18,16,.55)), url(${JSON.stringify(card.image)})` } : undefined}><span>{card.image ? "" : card.icon}</span><small>{card.city.toUpperCase()}</small>{card.state === "locked" && <i className="lock">VERROUILLÉE</i>}</div>
                <div className="city-card-body"><span className="card-state">{card.state === "collected" ? "✓ COLLECTIONNÉE" : card.state === "nearby" ? "À PROXIMITÉ" : card.state === "proposal" ? "VOTE COMMUNAUTAIRE" : "DÉFI"}</span><h3>{card.title}</h3><p>{card.description}</p><small className="requirement">⌖ {card.requirement}</small>
                  {card.state === "proposal" && <button className={voted.includes(card.id) ? "voted" : ""} onClick={() => vote(card.id)}><span>↑</span>{voted.includes(card.id) ? "Voté" : "Voter"}<b>{card.votes}</b></button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "profile" && (
        <section className="content-screen profile-screen">
          <ContentHeader eyebrow="EXPLORATEUR DEPUIS 2026" title={tabTitle} action="Réglages" onAction={() => setToast("Les réglages seront synchronisés sur cet appareil")} />
          <div className="profile-hero">
            <div className="profile-avatar"><span>PH</span><i>NIV. 8</i></div>
            <div className="profile-copy"><span>EXPLORATEUR URBAIN</span><h2>Paul H.</h2><p>Paris · France</p><div className="level-line"><i><em /></i><span>3 680 / 5 000 XP</span></div></div>
            <button className="outline-button" onClick={() => installPrompt && (installPrompt as Event & { prompt: () => Promise<void> }).prompt()}>{installPrompt ? "Installer l’app" : "PWA installée"}</button>
          </div>
          <div className="profile-stats">
            <article><span>↗</span><strong>{(totalDistance / 1000).toFixed(1)} km</strong><small>PARCOURUS</small></article>
            <article><span>◎</span><strong>{totalCircles}</strong><small>ZONES</small></article>
            <article><span>▦</span><strong>{collected + 11}</strong><small>CARTES</small></article>
            <article><span>⌖</span><strong>3</strong><small>VILLES</small></article>
          </div>
          <div className="profile-columns">
            <div>
              <div className="section-heading"><div><small>PROGRESSION</small><h2>Badges récents</h2></div><button>Voir les 14</button></div>
              <div className="badge-grid">
                <article><span>✦</span><div><b>Éclaireur</b><small>100 zones dévoilées</small></div></article>
                <article><span>5K</span><div><b>Grande marche</b><small>5 km sans pause</small></div></article>
                <article><span>⌁</span><div><b>Flâneur parisien</b><small>10 cartes de Paris</small></div></article>
              </div>
            </div>
            <div>
              <div className="section-heading"><div><small>COLLECTION</small><h2>Dernières cartes</h2></div><button onClick={() => setTab("cities")}>Tout voir</button></div>
              <div className="mini-collection">{cards.slice(0, 3).map((card) => <article className={card.tone} key={card.id}><span>{card.icon}</span><small>{card.city}</small><b>{card.title}</b></article>)}</div>
            </div>
          </div>
        </section>
      )}

      <nav className="mobile-nav" aria-label="Navigation principale">
        {(["map", "trips", "cities", "profile"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <NavIcon name={item} /><span>{({ map: "Carte", trips: "Trajets", cities: "Villes", profile: "Profil" })[item]}</span>
          </button>
        ))}
      </nav>

      {proposalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProposalOpen(false)}>
          <form className="proposal-modal" onSubmit={submitProposal} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setProposalOpen(false)} aria-label="Fermer">×</button>
            <span className="modal-eyebrow">COMMUNAUTÉ</span><h2>Proposer une carte</h2><p>Partagez un lieu, une histoire ou un détail que les explorateurs pourront débloquer sur place.</p>
            <label>Titre<input name="title" required placeholder="Ex. Les enseignes oubliées" /></label>
            <label>Ville<select name="city"><option>Paris</option><option>Lyon</option><option>Bordeaux</option></select></label>
            <label>Description<textarea name="description" required rows={4} placeholder="Pourquoi cette découverte mérite-t-elle une carte ?" /></label>
            <label>Image<input name="image" type="file" accept="image/*" /></label>
            <button className="submit-proposal" type="submit">Publier pour le vote <span>→</span></button>
          </form>
        </div>
      )}
      {qrOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setQrOpen(false)}>
          <form className="proposal-modal qr-modal" onSubmit={unlockQr} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setQrOpen(false)} aria-label="Fermer">×</button>
            <span className="modal-eyebrow">DÉBLOCAGE SUR PLACE</span><h2>Scanner un QR</h2><div className="qr-frame"><i /><span>▦</span><small>Placez le code dans le cadre</small></div>
            <p>Sur cet aperçu, saisissez le code imprimé sous le QR. Essayez <b>PARIS-2026</b>.</p>
            <label>Code de la carte<input name="code" required placeholder="PARIS-2026" autoFocus /></label>
            <button className="submit-proposal" type="submit">Débloquer la carte <span>→</span></button>
          </form>
        </div>
      )}
    </main>
  );
}

function ContentHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction?: () => void }) {
  return <header className="content-header"><div><span>{eyebrow}</span><h1>{title}</h1></div><button onClick={onAction}>{action}<b>→</b></button></header>;
}
