import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let supabase: ReturnType<typeof createClient> | null = null;

if (config.SUPABASE_URL && config.SUPABASE_KEY) {
  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
  console.log("[Storage] Supabase client initialized.");
} else {
  console.warn("[Storage] SUPABASE_URL or SUPABASE_KEY missing. Media uploads will fall back to Data URIs (dangerous for large files).");
}

/**
 * Uploads media to Supabase Storage and returns the public URL.
 * Falls back to null if unconfigured or on error.
 */
export async function uploadMediaToStorage(
  base64Data: string,
  mimeType: string,
  fileName?: string
): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    
    // Attempt to guess extension if fileName not provided
    let ext = "bin";
    if (mimeType) {
      const parts = mimeType.split("/");
      if (parts.length > 1) {
        ext = parts[1].split(";")[0]; // remove charset if present
      }
    }
    
    const name = fileName || `media_${Date.now()}.${ext}`;
    // Sanitize path
    const path = `whatsapp/${Date.now()}_${name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    // Upload to 'conversia-media' bucket
    const { data, error } = await supabase.storage
      .from("conversia-media")
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("[Storage] Upload failed:", error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("conversia-media")
      .getPublicUrl(path);

    console.log(`[Storage] Upload successful! Public URL: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("[Storage] Exception during upload:", err);
    return null;
  }
}
