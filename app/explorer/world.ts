import { geometryArea, pointInGeometry } from "./regions";
import type { ExplorationScope, LngLat, RegionGeometry } from "./types";

type ArcPoint = [number, number];
type ArcGeometry = {
  type: "Polygon" | "MultiPolygon";
  arcs: number[][] | number[][][];
  id?: string;
  properties?: { name?: string };
};
type WorldTopology = {
  type: "Topology";
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: ArcPoint[][];
  objects: { countries: { geometries: ArcGeometry[] } };
};

const EUROPE_IDS = new Set([
  "008", "020", "040", "056", "070", "100", "112", "191", "196", "203", "208", "233", "246", "250",
  "276", "300", "336", "348", "352", "372", "380", "428", "438", "440", "442", "470", "492", "498",
  "499", "528", "578", "616", "620", "642", "643", "674", "688", "703", "705", "724", "752", "756",
  "792", "804", "807", "826", "831", "832", "833", "807", "275",
]);

function decodeTopology(topology: WorldTopology) {
  const decodedArcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([deltaX, deltaY]) => {
      x += deltaX;
      y += deltaY;
      return [
        x * topology.transform.scale[0] + topology.transform.translate[0],
        y * topology.transform.scale[1] + topology.transform.translate[1],
      ] as LngLat;
    });
  });

  const ring = (indexes: number[]) => indexes.flatMap((index, part) => {
    const points = index < 0 ? [...decodedArcs[~index]].reverse() : decodedArcs[index];
    return part ? points.slice(1) : points;
  });

  return topology.objects.countries.geometries.map((item) => {
    const geometry: RegionGeometry = item.type === "Polygon"
      ? { type: "Polygon", coordinates: (item.arcs as number[][]).map(ring) }
      : { type: "MultiPolygon", coordinates: (item.arcs as number[][][]).map((polygon) => polygon.map(ring)) };
    return { id: item.id ?? "", name: item.properties?.name ?? "Pays", geometry };
  });
}

let countriesPromise: Promise<ReturnType<typeof decodeTopology>> | null = null;

export function loadCountries() {
  if (!countriesPromise) {
    countriesPromise = fetch("/data/countries-50m.json")
      .then((response) => {
        if (!response.ok) throw new Error("Fond mondial indisponible");
        return response.json() as Promise<WorldTopology>;
      })
      .then(decodeTopology);
  }
  return countriesPromise;
}

export async function loadWorldScopes(point: { lat: number; lng: number }) {
  const countries = await loadCountries();
  const country = countries.find((item) => pointInGeometry(point, item.geometry))
    ?? countries.find((item) => item.id === "250");
  const europePolygons = countries
    .filter((item) => EUROPE_IDS.has(item.id))
    .flatMap((item) => item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.coordinates);
  const europeGeometry: RegionGeometry = { type: "MultiPolygon", coordinates: europePolygons };
  const countryScope: ExplorationScope = {
    id: `scope-country-${country?.id ?? "250"}`,
    level: "country",
    code: country?.id ?? "250",
    name: country?.name === "France" ? "France" : (country?.name ?? "France"),
    geometry: country?.geometry,
    areaM2: country ? geometryArea(country.geometry) : 551_695_000_000,
  };
  const continentScope: ExplorationScope = {
    id: "scope-continent-europe",
    level: "continent",
    code: "EU",
    name: "Europe",
    geometry: europeGeometry,
    areaM2: 10_180_000_000_000,
  };
  const worldScope: ExplorationScope = {
    id: "scope-world",
    level: "world",
    code: "WORLD",
    name: "Monde",
    areaM2: 148_940_000_000_000,
  };
  return { country: countryScope, continent: continentScope, world: worldScope };
}
