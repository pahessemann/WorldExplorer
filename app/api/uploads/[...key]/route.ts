import { apiError } from "../../_lib/server";
import { getUploads } from "@/db";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await context.params;
  const key = parts.join("/");
  if (!key || key.includes("..")) return apiError("Image invalide.");
  const object = await getUploads().get(key);
  if (!object) return apiError("Image introuvable.", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
