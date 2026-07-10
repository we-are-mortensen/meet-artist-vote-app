"use client";

import { supabase, DRAWINGS_BUCKET } from "./supabase";

/**
 * Uploads a poll's drawing image to the shared `drawings` Storage bucket and
 * records it in `poll_drawings`. The table/bucket/RLS are owned by the Artist
 * Vote Dashboard repo; this add-on only inserts (drawings are write-once — there
 * is no update policy, so a second upload for the same poll fails by design).
 */
export async function uploadPollDrawing(args: {
  pollId: string;
  file: File;
  caption: string;
}): Promise<{ publicUrl: string }> {
  const { pollId, file, caption } = args;

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${pollId}-${Date.now()}.${ext}`;

  const upload = await supabase.storage.from(DRAWINGS_BUCKET).upload(path, file);
  if (upload.error) {
    throw new Error(`Failed to upload drawing: ${upload.error.message}`);
  }

  const insert = await supabase.from("poll_drawings").insert({
    poll_id: pollId,
    image_path: path,
    caption: caption.trim() || null,
  });
  if (insert.error) {
    throw new Error(`Failed to record drawing: ${insert.error.message}`);
  }

  const publicUrl = supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(path).data.publicUrl;
  return { publicUrl };
}
