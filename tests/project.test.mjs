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
  assert.match(storage, /const DB_VERSION = 2/);
  for (const store of ["circles", "trips", "collections", "outbox"]) assert.match(storage, new RegExp(`"${store}"`));
  assert.match(serviceWorker, /worldexplorer-static-v7/);
  assert.match(serviceWorker, /client\.navigate\(client\.url\)/);
  assert.match(serviceWorker, /worldexplorer-osm-v1/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /event\.respondWith\(networkFirst\(event\.request\)\)/);
});

test("keeps the map visible and removes decorative controls", async () => {
  const explorer = await source("app/explorer-app.tsx");
  assert.match(explorer, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(explorer, /fillOpacity: 0\.28/);
  assert.doesNotMatch(explorer, /Radar des découvertes|RÉCLAMER|map-layer-control/);
  assert.match(explorer, /Aucune énergie, aucun booster et aucune zone payante/);
  assert.match(explorer, /mystery-marker/);
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
