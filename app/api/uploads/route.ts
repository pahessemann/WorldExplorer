import { apiError, validDeviceId } from "../_lib/server";
import { getUploads } from "@/db";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    const deviceId = form.get("deviceId");
    if (!validDeviceId(deviceId)) return apiError("Appareil invalide.");
    if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
      return apiError("Utilisez une image JPG, PNG ou WebP de moins de 4 Mo.");
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `${deviceId}/${crypto.randomUUID()}.${extension}`;
    await getUploads().put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });
    return Response.json({ key, url: `/api/uploads/${key}` }, { status: 201 });
  } catch (error) {
    console.error("uploads.post", error);
    return apiError("Impossible d’envoyer l’image.", 500);
  }
}
