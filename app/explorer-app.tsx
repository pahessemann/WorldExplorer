"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { baseCards, demoPath, GPS_INTERVAL, PARIS, REVEAL_DISTANCE } from "./explorer/demo-data";
import { circleRing, distanceBetween, formatDistance, formatTime, routeDistance } from "./explorer/geo";
import { loadLeaflet } from "./explorer/leaflet";
import { exploredRegionPercent, fetchRegionAt, generateRegionCollectibles, geometryBounds, pointInGeometry } from "./explorer/regions";
import { deleteRecord, mergeById, putRecord, readAll } from "./explorer/storage";
import type { CityCard, Collection, CollectibleDiscovery, Point, RegionBoundary, RegionalCollectible, Reveal, Tab, Trip } from "./explorer/types";
import { flushOutbox, pullCloudState, pullCommunityCards, redeemQrCode, syncCircle, syncCollection, syncDiscovery, syncProposal, syncTrip, syncVote } from "./sync";

function NavIcon({ name }: { name: Tab }) {
  return <span className={`nav-glyph nav-glyph-${name}`} aria-hidden="true" />;
}

export function ExplorerApp() {
  const [tab, setTab] = useState<Tab>("map");
  const [circles, setCircles] = useState<Reveal[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
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
  const [region, setRegion] = useState<RegionBoundary | null>(null);
  const [regionStatus, setRegionStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [discoveries, setDiscoveries] = useState<CollectibleDiscovery[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [voted, setVoted] = useState<string[]>([]);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mapAttempt, setMapAttempt] = useState(0);
  const [syncState, setSyncState] = useState<"syncing" | "synced" | "offline">("syncing");
  const mapRef = useRef<unknown>(null);
  const layersRef = useRef<Record<string, unknown>>({});
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const lastGpsRef = useRef(0);
  const demoIndexRef = useRef(0);
  const lastRegionLookupRef = useRef<Pick<Point, "lat" | "lng"> | null>(null);
  const cardsRef = useRef<CityCard[]>(baseCards);
  const collectiblesRef = useRef<RegionalCollectible[]>([]);
  const discoveredRef = useRef(new Set<string>());
  const unlockedRef = useRef(new Set(baseCards.filter((card) => card.state === "collected").map((card) => card.id)));
  const regionCollectibles = useMemo(() => region ? generateRegionCollectibles(region) : [], [region]);
  const discoveredIds = useMemo(() => new Set(discoveries.map((discovery) => discovery.id)), [discoveries]);

  const unlockCard = useCallback((cardId: string, method: Collection["method"], message: string) => {
    if (unlockedRef.current.has(cardId)) return false;
    unlockedRef.current.add(cardId);
    setCards((current) => {
      const next = current.map((card) => card.id === cardId
        ? { ...card, state: "collected" as const, requirement: "Dans votre collection" }
        : card);
      cardsRef.current = next;
      return next;
    });
    const collection: Collection = {
      id: `${cardId}-${Date.now()}`,
      cardId,
      method,
      collectedAt: Date.now(),
    };
    void putRecord("collections", collection);
    void syncCollection(collection);
    setToast(message);
    return true;
  }, []);

  const unlockCollectible = useCallback((collectible: RegionalCollectible) => {
    if (discoveredRef.current.has(collectible.id)) return false;
    discoveredRef.current.add(collectible.id);
    const discovery: CollectibleDiscovery = {
      id: collectible.id,
      regionCode: collectible.regionCode,
      collectedAt: Date.now(),
    };
    setDiscoveries((current) => [...current, discovery]);
    void putRecord("discoveries", discovery);
    void syncDiscovery(discovery);
    setToast(`${collectible.title} trouvé · ajouté à votre collection !`);
    return true;
  }, []);

  const refreshRegion = useCallback(async (point: Pick<Point, "lat" | "lng">) => {
    lastRegionLookupRef.current = point;
    setRegionStatus("loading");
    try {
      const nextRegion = await fetchRegionAt(point);
      setRegion(nextRegion);
      void putRecord("meta", nextRegion);
      setRegionStatus("ready");
    } catch {
      setRegionStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    Promise.all([
      readAll<Reveal>("circles"),
      readAll<Trip>("trips"),
      readAll<CityCard>("proposals"),
      readAll<Collection>("collections"),
      readAll<CollectibleDiscovery>("discoveries"),
      readAll<RegionBoundary>("meta"),
    ])
      .then(([savedCircles, savedTrips, proposals, collections, savedDiscoveries, metadata]) => {
        const realCircles = savedCircles.filter((circle) => !circle.id.startsWith("reveal-demo-"));
        const realTrips = savedTrips.filter((trip) => !trip.id.startsWith("trip-demo-"));
        savedCircles.filter((circle) => circle.id.startsWith("reveal-demo-")).forEach((circle) => void deleteRecord("circles", circle.id));
        savedTrips.filter((trip) => trip.id.startsWith("trip-demo-")).forEach((trip) => void deleteRecord("trips", trip.id));
        if (realCircles.length) setCircles(realCircles);
        if (realTrips.length) setTrips(realTrips.sort((a, b) => b.startedAt - a.startedAt));
        if (proposals.length) setCards((current) => [...current, ...proposals]);
        if (collections.length) {
          collections.forEach((collection) => unlockedRef.current.add(collection.cardId));
          setCards((current) => current.map((card) => unlockedRef.current.has(card.id)
            ? { ...card, state: "collected", requirement: "Dans votre collection" }
            : card));
        }
        if (savedDiscoveries.length) {
          savedDiscoveries.forEach((discovery) => discoveredRef.current.add(discovery.id));
          setDiscoveries(savedDiscoveries);
        }
        const cachedRegion = metadata.find((item) => item.id === "active-region");
        if (cachedRegion?.geometry) {
          setRegion(cachedRegion);
          setRegionStatus("ready");
        }
      })
      .catch(() => setToast("Stockage local indisponible sur ce navigateur"))
      .finally(() => setStorageReady(true));

    const votes = window.localStorage.getItem("worldexplorer-votes");
    if (votes) {
      try {
        const storedVotes = JSON.parse(votes) as string[];
        window.setTimeout(() => setVoted(storedVotes), 0);
      } catch {
        window.localStorage.removeItem("worldexplorer-votes");
      }
    }
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const hydrateCloud = async () => {
      if (!navigator.onLine) {
        setSyncState("offline");
        return;
      }
      setSyncState("syncing");
      try {
        await flushOutbox();
        const [remoteCards, cloud] = await Promise.all([pullCommunityCards(), pullCloudState()]);
        setCircles((current) => {
          const merged = mergeById(current, cloud.circles);
          cloud.circles.forEach((circle) => void putRecord("circles", circle));
          return merged;
        });
        setTrips((current) => {
          const merged = mergeById(current, cloud.trips).sort((a, b) => b.startedAt - a.startedAt);
          cloud.trips.forEach((trip) => void putRecord("trips", trip));
          return merged;
        });
        setCards((current) => {
          const merged = new Map(current.map((card) => [card.id, card]));
          remoteCards.forEach((card) => {
            const existing = merged.get(card.id);
            merged.set(card.id, existing ? { ...card, state: existing.state, requirement: existing.requirement } : card);
          });
          cloud.collections.forEach((collection) => {
            unlockedRef.current.add(collection.cardId);
            void putRecord("collections", collection);
            const card = merged.get(collection.cardId);
            if (card) merged.set(card.id, { ...card, state: "collected", requirement: "Dans votre collection" });
          });
          const next = [...merged.values()];
          cardsRef.current = next;
          return next;
        });
        setDiscoveries((current) => {
          const merged = mergeById(current, cloud.discoveries);
          cloud.discoveries.forEach((discovery) => {
            discoveredRef.current.add(discovery.id);
            void putRecord("discoveries", discovery);
          });
          return merged;
        });
        setSyncState("synced");
      } catch {
        setSyncState("offline");
      }
    };
    void hydrateCloud();

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("online", hydrateCloud);
    const onOffline = () => setSyncState("offline");
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("online", hydrateCloud);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    collectiblesRef.current = regionCollectibles;
  }, [regionCollectibles]);

  useEffect(() => {
    discoveries.forEach((discovery) => discoveredRef.current.add(discovery.id));
  }, [discoveries]);

  useEffect(() => {
    if (!storageReady) return;
    const target = position ?? (!region ? PARIS : null);
    if (!target || (region && pointInGeometry(target, region.geometry))) return;
    if (lastRegionLookupRef.current && distanceBetween(lastRegionLookupRef.current, target) < 1_000) return;
    void refreshRegion(target);
  }, [position, region, refreshRegion, storageReady]);

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
      void putRecord("circles", next);
      void syncCircle(next);
      setToast("Nouvelle zone dévoilée · +50 m");
      return [...current, next];
    });
    cardsRef.current.forEach((card) => {
      if (card.state === "collected" || card.state === "proposal" || card.latitude == null || card.longitude == null) return;
      if (distanceBetween(point, { lat: card.latitude, lng: card.longitude }) <= (card.unlockRadius ?? 50)) {
        unlockCard(card.id, "gps", `Carte « ${card.title} » découverte !`);
      }
    });
    collectiblesRef.current.forEach((collectible) => {
      if (discoveredRef.current.has(collectible.id)) return;
      if (distanceBetween(point, collectible) <= collectible.unlockRadius) unlockCollectible(collectible);
    });
    if (tracking && point.ts - lastGpsRef.current >= GPS_INTERVAL) {
      lastGpsRef.current = point.ts;
      setRoute((current) => [...current, point]);
    }
  }, [tracking, unlockCard, unlockCollectible]);

  useEffect(() => {
    if (!tracking || demoMode || !navigator.geolocation) return;
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
    let tileLoaded = false;
    setMapStatus("loading");
    void loadLeaflet().then(() => {
      if (cancelled || !mapNodeRef.current || mapRef.current || !window.L) return;
      const L = window.L as unknown as {
        map: (node: HTMLElement, options: object) => { setView: (p: number[], z: number) => unknown; invalidateSize: () => void; remove: () => void };
        tileLayer: (url: string, options: object) => { addTo: (map: unknown) => unknown; on: (event: string, callback: () => void) => void };
        layerGroup: () => { addTo: (map: unknown) => { clearLayers: () => void } };
      };
      const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: false });
      map.setView([PARIS.lat, PARIS.lng], 16);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        minZoom: 3,
        crossOrigin: true,
        className: "cartoon-map-tiles",
      });
      tiles.on("tileload", () => {
        tileLoaded = true;
        if (!cancelled) setMapStatus("ready");
      });
      tiles.on("tileerror", () => {
        window.setTimeout(() => {
          if (!cancelled && !tileLoaded) setMapStatus("error");
        }, 1_200);
      });
      tiles.addTo(map);
      mapRef.current = map;
      layersRef.current = {
        fog: L.layerGroup().addTo(map),
        reveals: L.layerGroup().addTo(map),
        territory: L.layerGroup().addTo(map),
        mysteries: L.layerGroup().addTo(map),
        collectibles: L.layerGroup().addTo(map),
        route: L.layerGroup().addTo(map),
        marker: L.layerGroup().addTo(map),
      };
      setMapReady(true);
      window.requestAnimationFrame(() => map.invalidateSize());
    }).catch(() => {
      if (!cancelled) setMapStatus("error");
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
  }, [tab, mapAttempt]);

  useEffect(() => {
    if (!mapRef.current || !window.L || tab !== "map") return;
    const L = window.L as unknown as {
      polygon: (points: unknown, options: object) => { addTo: (layer: unknown) => unknown };
      circle: (point: number[], options: object) => { addTo: (layer: unknown) => unknown };
      polyline: (points: number[][], options: object) => { addTo: (layer: unknown) => unknown; getBounds: () => unknown };
      marker: (point: number[], options: object) => { addTo: (layer: unknown) => unknown };
      divIcon: (options: object) => unknown;
      geoJSON: (data: object, options: object) => { addTo: (layer: unknown) => unknown };
    };
    const layers = layersRef.current as Record<string, { clearLayers: () => void }>;
    Object.values(layers).forEach((layer) => layer.clearLayers());

    const world = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
    L.polygon([world, ...circles.map(circleRing)], {
      stroke: false,
      fillColor: "#476275",
      fillOpacity: 0.28,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(layers.fog);
    circles.forEach((circle) => {
      L.circle([circle.lat, circle.lng], {
        radius: 50,
        color: "#327052",
        weight: 3,
        opacity: 0.78,
        fillColor: "#b9f29a",
        fillOpacity: 0.24,
        interactive: false,
      }).addTo(layers.reveals);
    });
    if (region) {
      const feature = { type: "Feature", properties: {}, geometry: region.geometry };
      L.geoJSON(feature, {
        interactive: false,
        style: { color: "#24384f", weight: 8, opacity: 0.9, dashArray: "15 8", fillOpacity: 0 },
      }).addTo(layers.territory);
      L.geoJSON(feature, {
        interactive: false,
        style: { color: "#fff8d7", weight: 4, opacity: 1, dashArray: "11 12", fillOpacity: 0 },
      }).addTo(layers.territory);
    }
    cards.forEach((card) => {
      if (card.latitude == null || card.longitude == null || card.state === "proposal") return;
      const found = card.state === "collected";
      L.marker([card.latitude, card.longitude], {
        icon: L.divIcon({
          className: "mystery-marker-wrap",
          html: `<span class="mystery-marker ${found ? "found" : ""}" aria-label="${found ? "Mystère découvert" : "Lieu mystérieux"}"><b>${found ? "★" : "?"}</b></span>`,
          iconSize: [38, 44],
          iconAnchor: [19, 42],
        }),
      }).addTo(layers.mysteries);
    });
    regionCollectibles.forEach((collectible) => {
      const found = discoveredIds.has(collectible.id);
      L.marker([collectible.lat, collectible.lng], {
        icon: L.divIcon({
          className: "collectible-marker-wrap",
          html: `<span class="collectible-marker ${found ? "found" : ""}" aria-label="${found ? "Trouvaille collectée" : collectible.title}"><b>${found ? "✓" : collectible.icon}</b></span>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        }),
      }).addTo(layers.collectibles);
    });
    if (route.length > 1) {
      L.polyline(route.map((p) => [p.lat, p.lng]), {
        color: "#253b55",
        weight: 9,
        opacity: 0.72,
        lineCap: "round",
      }).addTo(layers.route);
      const line = L.polyline(route.map((p) => [p.lat, p.lng]), {
        color: "#fff8d7",
        weight: 5,
        opacity: 1,
        lineCap: "round",
      });
      line.addTo(layers.route);
    }
    if (position) {
      L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          className: "explorer-marker-wrap",
          html: `<span class="explorer-marker"><b></b><i style="transform:rotate(${heading}deg)"></i></span>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        }),
      }).addTo(layers.marker);
    }
  }, [circles, route, position, heading, tab, mapReady, cards, region, regionCollectibles, discoveredIds]);

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
        city: region?.name ?? "Paris",
        startedAt,
        duration: Math.max(elapsed, 1),
        distance: routeDistance(route),
        circles: route.length,
        points: route,
      };
      setTrips((current) => [trip, ...current]);
      void putRecord("trips", trip);
      void syncTrip(trip);
      const lifetimeDistance = trips.reduce((sum, savedTrip) => sum + savedTrip.distance, 0) + trip.distance;
      cardsRef.current.forEach((card) => {
        if (card.state !== "collected" && card.state !== "proposal" && card.challengeDistance && lifetimeDistance >= card.challengeDistance) {
          unlockCard(card.id, "challenge", `Défi réussi · carte « ${card.title} » ajoutée !`);
        }
      });
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

  const changeZoom = (direction: 1 | -1) => {
    const map = mapRef.current as { zoomIn?: () => void; zoomOut?: () => void } | null;
    if (direction > 0) map?.zoomIn?.();
    else map?.zoomOut?.();
  };

  const showRegion = () => {
    if (!region) return;
    const bounds = geometryBounds(region.geometry);
    const map = mapRef.current as { fitBounds?: (bounds: number[][], options?: object) => void } | null;
    map?.fitBounds?.([[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]], { padding: [28, 28] });
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
      latitude: position?.lat ?? PARIS.lat,
      longitude: position?.lng ?? PARIS.lng,
      unlockRadius: 50,
    };
    setCards((current) => [...current, proposal]);
    void putRecord("proposals", proposal);
    void syncProposal(proposal, file instanceof File && file.size ? file : undefined);
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

  const unlockQr = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") || "").trim().toUpperCase();
    if (!code) return;
    try {
      const cardId = await redeemQrCode(code);
      const card = cardsRef.current.find((item) => item.id === cardId);
      unlockCard(cardId, "qr", `Carte « ${card?.title ?? "Mystère"} » débloquée !`);
      setQrOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Ce QR code n’est pas reconnu");
    }
  };

  const routeMeters = routeDistance(route);
  const speedKmh = ((position?.speed ?? 0) * 3.6);
  const totalDistance = trips.reduce((sum, trip) => sum + trip.distance, 0);
  const totalDuration = trips.reduce((sum, trip) => sum + trip.duration, 0);
  const totalCircles = circles.length + trips.reduce((sum, trip) => sum + trip.circles, 0);
  const collected = cards.filter((card) => card.state === "collected").length;
  const regionPercent = useMemo(() => region ? exploredRegionPercent(region, circles) : 0, [region, circles]);
  const regionalFound = regionCollectibles.filter((collectible) => discoveredIds.has(collectible.id)).length;
  const exploredCities = new Set([
    ...cards.filter((card) => card.state === "collected").map((card) => card.city),
    ...discoveries.map((discovery) => discovery.regionCode),
  ]).size;
  const xp = circles.length * 10 + trips.length * 100 + collected * 250 + discoveries.length * 100;
  const level = Math.floor(xp / 1_000) + 1;
  const levelProgress = Math.round((xp % 1_000) / 10);
  const weeklyDistances = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const start = today.getTime() - (6 - index) * 86_400_000;
      const end = start + 86_400_000;
      return {
        label: new Date(start).toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase(),
        distance: trips.filter((trip) => trip.startedAt >= start && trip.startedAt < end).reduce((sum, trip) => sum + trip.distance, 0),
      };
    });
  }, [trips]);
  const weeklyTotal = weeklyDistances.reduce((sum, day) => sum + day.distance, 0);
  const weeklyMax = Math.max(1, ...weeklyDistances.map((day) => day.distance));

  const tabTitle = useMemo(() => ({ map: "Explorer", trips: "Journal", cities: `Mystères de ${region?.name ?? "Paris"}`, profile: "Mon aventure" })[tab], [tab, region]);
  const navigationLabels = { map: "Carte", trips: "Journal", cities: "Mystères", profile: "Moi" } as const;

  return (
    <main className={`app-shell tab-${tab}`}>
      <aside className="desktop-rail" aria-label="Navigation principale">
        <button className="brand" onClick={() => setTab("map")} aria-label="WorldExplorer, revenir à la carte">
          <span className="brand-mark"><i /></span>
          <span>WORLD<br /><b>EXPLORER</b></span>
        </button>
        <nav>
          {(["map", "trips", "cities", "profile"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} aria-label={navigationLabels[item]}>
              <NavIcon name={item} />
              <span>{navigationLabels[item]}</span>
            </button>
          ))}
        </nav>
      </aside>

      {tab === "map" && (
        <section className="map-screen" aria-label="Carte d’exploration">
          <div ref={mapNodeRef} className="map-canvas" aria-label={`Carte de ${region?.name ?? "Paris"} avec zones explorées`} />
          <div className="map-vignette" />
          <a className="osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
          <header className="map-header">
            <button className="map-brand" onClick={() => setTab("map")} aria-label="Recentrer sur la carte"><span>🌍</span><b>WorldExplorer</b></button>
            <div className="map-live-status"><i className={gpsState === "live" ? "active" : ""} /><span>{region ? `${region.name} · ${regionPercent.toFixed(2)}%` : `${circles.length} fragments`} · {regionalFound}/{regionCollectibles.length} trouvailles</span><em className={`sync-state ${syncState}`}>{syncState === "synced" ? "Sauvegardé" : syncState === "syncing" ? "Synchronisation" : "Hors ligne"}</em></div>
          </header>

          {mapStatus !== "ready" && <div className={`map-state map-state-${mapStatus}`}>
            {mapStatus === "loading"
              ? <><span className="map-loader" /><b>Chargement de la carte…</b></>
              : <><b>La carte n’a pas pu se charger</b><button onClick={() => setMapAttempt((attempt) => attempt + 1)}>Réessayer</button></>}
          </div>}

          <div className="map-controls" aria-label="Commandes de la carte">
            <button className="locate-button" onClick={locate} aria-label="Afficher ma position"><span>⌖</span>Ma position</button>
            <div className="zoom-controls">
              <button onClick={() => changeZoom(1)} aria-label="Zoomer">+</button>
              <button onClick={() => changeZoom(-1)} aria-label="Dézoomer">−</button>
            </div>
          </div>

          <div className="map-legend" aria-label="Légende de la carte">
            <span><i className="legend-revealed" />Dévoilé</span>
            <span><i className="legend-hidden" />Brouillard</span>
            <span><i className="legend-territory" />Commune</span>
          </div>

          <div className="explore-panel">
            {region ? <div className="territory-progress">
              <div className="territory-heading"><span className="territory-icon">?</span><div><small>COMMUNE · {region.postcodes[0] ?? region.code}</small><strong>{region.name}</strong></div><b>{regionPercent.toFixed(2)}%</b><button onClick={showRegion}>Voir tout</button></div>
              <div className="territory-track"><i style={{ width: `${Math.max(regionPercent, 0.6)}%` }} /></div>
              <small>{regionalFound}/{regionCollectibles.length} trouvailles collectées dans ce territoire</small>
            </div> : <div className="territory-progress territory-loading"><b>{regionStatus === "unavailable" ? "Contour communal disponible en France" : "Recherche du territoire…"}</b></div>}
            {!circles.length && !tracking && <p className="first-adventure">Chaque pas efface le brouillard. Aucun pass, aucune énergie à acheter.</p>}
            <div className="live-metrics">
              <span><small>Vitesse</small><b>{speedKmh.toFixed(1)} km/h</b></span>
              <span><small>Distance</small><b>{formatDistance(routeMeters)}</b></span>
              <span><small>Durée</small><b>{formatTime(elapsed)}</b></span>
              <span><small>Direction</small><b>{Math.round(heading)}°</b></span>
            </div>
            <button className={`explore-button ${tracking ? "recording" : ""}`} onClick={() => tracking ? stop() : start(false)}>
              <span>{tracking ? "■" : "▶"}</span><strong>{tracking ? "Terminer" : "Démarrer l’exploration"}</strong>
            </button>
            {!tracking && <button className="demo-link" onClick={() => start(true)}>Tester sans GPS</button>}
          </div>
          {selectedTrip && <button className="history-pill" onClick={() => { setSelectedTrip(null); setRoute([]); }}>× Fermer le trajet affiché</button>}
          <div className={`toast ${toast ? "show" : ""}`} role="status"><span>✓</span>{toast}</div>
        </section>
      )}

      {tab === "trips" && (
        <section className="content-screen">
          <ContentHeader eyebrow="VOS AVENTURES" title={tabTitle} action="Exporter" onAction={exportTrips} />
          <div className="overview-grid">
            <article className="hero-stat lime-panel">
              <span className="stat-symbol">↗</span>
              <p>Distance totale</p><strong>{(totalDistance / 1000).toFixed(1)}<small> km</small></strong>
              <span className="trend">{trips.length ? `${trips.length} exploration${trips.length > 1 ? "s" : ""}` : "Prêt pour la première sortie"}</span>
            </article>
            <article className="week-card">
              <div className="card-heading"><div><span>7 DERNIERS JOURS</span><strong>Votre rythme</strong></div><b>{formatDistance(weeklyTotal)}</b></div>
              <div className="bar-chart" aria-label="Distance parcourue ces sept derniers jours">
                {weeklyDistances.map((day, index) => <i key={index} style={{ height: `${Math.max(3, (day.distance / weeklyMax) * 100)}%` }}><span>{day.label}</span></i>)}
              </div>
            </article>
            <article className="mini-stat"><span>◷</span><div><small>TEMPS EN MOUVEMENT</small><strong>{formatTime(totalDuration)}</strong></div></article>
            <article className="mini-stat"><span>◎</span><div><small>ZONES DÉVOILÉES</small><strong>{totalCircles}</strong></div></article>
          </div>
          <div className="section-heading"><div><small>HISTORIQUE</small><h2>Explorations récentes</h2></div></div>
          <div className="trip-list">
            {!trips.length && <div className="empty-state"><span>↗</span><h3>Aucun trajet enregistré</h3><p>Démarrez une exploration depuis la carte. Votre trajet apparaîtra ici.</p><button onClick={() => setTab("map")}>Ouvrir la carte</button></div>}
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
          <ContentHeader eyebrow="LIEUX CACHÉS" title={tabTitle} action="Code secret" onAction={() => setQrOpen(true)} />
          <div className="city-hero">
            <div className="city-art"><span>{region ? `COMMUNE · ${region.postcodes[0] ?? region.code}` : "TERRITOIRE EN COURS"}</span><i className="territory-emblem">?</i><em>{regionCollectibles.length} TROUVAILLES<br />À COLLECTIONNER</em></div>
            <div className="city-progress">
              <span>TERRITOIRE EN COURS</span><h2>{region?.name ?? "Paris"}</h2><p>Suivez le contour communal, effacez le brouillard et trouvez les objets cachés partout dans le territoire.</p>
              <div className="collection-count"><strong>{regionalFound}</strong><span>/ {regionCollectibles.length} trouvailles</span><b>{regionPercent.toFixed(2)}%</b></div>
              <i className="progress-track"><em style={{ width: `${Math.max(regionPercent, 0.6)}%` }} /></i>
              <button onClick={() => setTab("map")}>Continuer l’exploration <span>↗</span></button>
            </div>
          </div>
          <div className="section-heading cards-heading"><div><small>MYSTÈRES DE LA COMMUNAUTÉ</small><h2>Histoires à découvrir</h2></div><button onClick={() => setProposalOpen(true)}>+ Proposer un mystère</button></div>
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
          <ContentHeader eyebrow="VOTRE PROGRESSION" title={tabTitle} />
          <div className="profile-hero">
            <div className="profile-avatar"><span>PH</span><i>NIV. {level}</i></div>
            <div className="profile-copy"><span>AVENTURIER URBAIN</span><h2>Paul H.</h2><p>Paris · France</p><div className="level-line"><i><em style={{ width: `${levelProgress}%` }} /></i><span>{xp % 1_000} / 1 000 XP gagnés en explorant</span></div></div>
            {installPrompt && <button className="outline-button" onClick={() => (installPrompt as Event & { prompt: () => Promise<void> }).prompt()}>Installer l’app</button>}
          </div>
          <div className="profile-stats">
            <article><span>↗</span><strong>{(totalDistance / 1000).toFixed(1)} km</strong><small>PARCOURUS</small></article>
            <article><span>◎</span><strong>{totalCircles}</strong><small>ZONES</small></article>
            <article><span>▦</span><strong>{collected + discoveries.length}</strong><small>TROUVAILLES</small></article>
            <article><span>⌖</span><strong>{exploredCities}</strong><small>VILLES</small></article>
          </div>
          <div className="fair-play-note"><span>🌿</span><div><strong>Tout se gagne dehors</strong><p>Aucune énergie, aucun booster et aucune zone payante. La progression dépend uniquement de vos explorations.</p></div></div>
          <div className="profile-columns">
            <div>
              <div className="section-heading"><div><small>COLLECTION</small><h2>Cartes débloquées</h2></div><button onClick={() => setTab("cities")}>Voir la collection</button></div>
              {!collected && <div className="empty-state compact"><p>Explorez la ville pour débloquer votre première carte.</p><button onClick={() => setTab("map")}>Explorer</button></div>}
              <div className="mini-collection">{cards.filter((card) => card.state === "collected").slice(0, 3).map((card) => <article className={card.tone} key={card.id}><span>{card.icon}</span><small>{card.city}</small><b>{card.title}</b></article>)}</div>
            </div>
          </div>
        </section>
      )}

      <nav className="mobile-nav" aria-label="Navigation principale">
        {(["map", "trips", "cities", "profile"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <NavIcon name={item} /><span>{navigationLabels[item]}</span>
          </button>
        ))}
      </nav>

      {proposalOpen && (
        <div className="modal-backdrop">
          <button type="button" className="modal-dismiss" onClick={() => setProposalOpen(false)} aria-label="Fermer la proposition" />
          <form className="proposal-modal" onSubmit={submitProposal}>
            <button type="button" className="modal-close" onClick={() => setProposalOpen(false)} aria-label="Fermer">×</button>
            <span className="modal-eyebrow">COMMUNAUTÉ</span><h2>Proposer un mystère</h2><p>Partagez un lieu, une histoire ou un détail que les autres aventuriers pourront révéler sur place.</p>
            <label>Titre<input name="title" required placeholder="Ex. Les enseignes oubliées" /></label>
            <label>Ville<select name="city"><option>Paris</option><option>Lyon</option><option>Bordeaux</option></select></label>
            <label>Description<textarea name="description" required rows={4} placeholder="Pourquoi cette découverte mérite-t-elle une carte ?" /></label>
            <label>Image<input name="image" type="file" accept="image/*" /></label>
            <button className="submit-proposal" type="submit">Soumettre aux aventuriers <span>→</span></button>
          </form>
        </div>
      )}
      {qrOpen && (
        <div className="modal-backdrop">
          <button type="button" className="modal-dismiss" onClick={() => setQrOpen(false)} aria-label="Fermer le scanner QR" />
          <form className="proposal-modal qr-modal" onSubmit={unlockQr}>
            <button type="button" className="modal-close" onClick={() => setQrOpen(false)} aria-label="Fermer">×</button>
            <span className="modal-eyebrow">CODE SECRET</span><h2>Révéler un mystère</h2>
            <p>Saisissez le code imprimé sous le QR. Pour tester, utilisez <b>PARIS-2026</b>.</p>
            <label>Code de la carte<input name="code" required placeholder="PARIS-2026" /></label>
            <button className="submit-proposal" type="submit">Débloquer la carte <span>→</span></button>
          </form>
        </div>
      )}
    </main>
  );
}

function ContentHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <header className="content-header"><div><span>{eyebrow}</span><h1>{title}</h1></div>{action && <button onClick={onAction}>{action}<b>→</b></button>}</header>;
}
