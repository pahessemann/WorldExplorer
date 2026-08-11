import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

type RuntimeBindings = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
};

function bindings() {
  return env as unknown as RuntimeBindings;
}

export function getD1() {
  const database = bindings().DB;
  if (!database) throw new Error("La base de données WorldExplorer est indisponible.");
  return database;
}

export function getUploads() {
  const bucket = bindings().UPLOADS;
  if (!bucket) throw new Error("Le stockage d’images WorldExplorer est indisponible.");
  return bucket;
}
