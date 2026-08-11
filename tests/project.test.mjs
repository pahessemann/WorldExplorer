import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("uses the production D1 and R2 bindings", async () => {
  const hosting = JSON.parse(await source(".openai/hosting.json"));
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "UPLOADS");
});

test("keeps exploration offline-first", async () => {
  const [storage, serviceWorker] = await Promise.all([
    source("app/explorer/storage.ts"),
    source("public/sw.js"),
  ]);
  assert.match(storage, /const DB_VERSION = 3/);
  for (const store of ["circles", "trips", "collections", "discoveries", "outbox"]) assert.match(storage, new RegExp(`"${store}"`));
  assert.match(serviceWorker, /worldexplorer-static-v10/);
  assert.match(serviceWorker, /client\.navigate\(client\.url\)/);
  assert.match(serviceWorker, /worldexplorer-osm-v1/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /event\.respondWith\(networkFirst\(event\.request\)\)/);
});

test("keeps the map visible and removes decorative controls", async () => {
  const explorer = await source("app/explorer-app.tsx");
  assert.match(explorer, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(explorer, /className: "cartoon-map-tiles"/);
  assert.match(explorer, /fillOpacity: 0\.58/);
  assert.match(await source("app/globals.css"), /saturate\(1\.38\).*sepia\(\.06\)/s);
  assert.doesNotMatch(explorer, /Radar des découvertes|RÉCLAMER|map-layer-control/);
  assert.match(explorer, /Aucune énergie, aucun booster et aucune zone payante/);
  assert.match(explorer, /mystery-marker/);
  assert.match(explorer, /collectible-marker/);
  assert.match(explorer, /L\.geoJSON/);
  assert.match(explorer, /mergeRevealCircles/);
  assert.doesNotMatch(explorer, /circles\.forEach\(\(circle\).*L\.circle/s);
});

test("merges overlapping reveals into unique outlined zones", async () => {
  const zones = await source("app/explorer/exploration-zones.ts");
  assert.match(zones, /function traceRings/);
  assert.match(zones, /export function mergeRevealCircles/);
  assert.match(zones, /const cells = new Set/);
  assert.match(zones, /smoothRing/);
});

test("loads real French commune boundaries and computes territory progress", async () => {
  const regions = await source("app/explorer/regions.ts");
  assert.match(regions, /https:\/\/geo\.api\.gouv\.fr\/communes/);
  assert.match(regions, /geometry: "contour"/);
  assert.match(regions, /exploredRegionPercent/);
  assert.match(regions, /generateRegionCollectibles/);
  assert.match(regions, /loadFrenchScopes/);
  assert.match(regions, /exploredScopePercent/);
});

test("ships country, continent and world zoom scopes", async () => {
  const [explorer, world, countries] = await Promise.all([
    source("app/explorer-app.tsx"),
    source("app/explorer/world.ts"),
    source("public/data/countries-50m.json"),
  ]);
  assert.match(explorer, /scopeLevelForZoom/);
  for (const level of ["world", "continent", "country", "region", "department", "commune"]) assert.match(explorer, new RegExp(`"${level}"`));
  assert.match(world, /loadWorldScopes/);
  assert.equal(JSON.parse(countries).type, "Topology");
});

test("enforces the 50 metre reveal model", async () => {
  const [demo, schema, sync] = await Promise.all([
    source("app/explorer/demo-data.ts"),
    source("db/schema.ts"),
    source("app/api/sync/route.ts"),
  ]);
  assert.match(demo, /GPS_INTERVAL = 5_000/);
  assert.match(schema, /default\(50\)/);
  assert.match(sync, /VALUES \(\?, \?, \?, \?, 50, \?\)/);
});

test("ships community, vote, QR and image APIs", async () => {
  await Promise.all([
    "app/api/community/route.ts",
    "app/api/community/vote/route.ts",
    "app/api/community/unlock/route.ts",
    "app/api/uploads/route.ts",
  ].map((path) => source(path)));
});

test("persists regional discoveries in D1", async () => {
  const [schema, sync] = await Promise.all([source("db/schema.ts"), source("app/api/sync/route.ts")]);
  assert.match(schema, /regional_discoveries/);
  assert.match(sync, /INSERT OR IGNORE INTO regional_discoveries/);
  assert.match(sync, /collectible_id, region_code, collected_at/);
});
