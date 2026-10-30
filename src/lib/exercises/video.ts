export const VIDEO_BUCKET = "exercise-videos";
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
/** Public URL of an exercise clip, or null when it has none (or the stored path is not one of ours). */
export function exerciseVideoUrl(path: string | null | undefined, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!path || !supabaseUrl || !/^[a-z0-9][a-z0-9-]{1,100}-[0-9a-f]{8}\.(mp4|webm)$/.test(path)) return null;
  try { return `${new URL(supabaseUrl).origin}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`; } catch { return null; }
}
