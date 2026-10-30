import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PER_DAY = 10;
export const POSES = ["front", "side", "back", "other"] as const;
export type Pose = (typeof POSES)[number];

/** Content sniffing from the first bytes: we never trust the client-supplied MIME type or file name. */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type ProcessResult = { ok: true; data: Buffer; contentType: "image/webp"; width: number; height: number } | { ok: false; error: string };

/** Re-encodes to WebP: strips ALL metadata (EXIF/GPS), applies orientation, bounds the size. Rejects anything that is not a decodable photo. */
export async function processPhoto(input: Uint8Array): Promise<ProcessResult> {
  if (input.byteLength === 0) return { ok: false, error: "El archivo está vacío." };
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "La imagen supera 8 MB." };
  if (!sniffImage(input)) return { ok: false, error: "Solo se aceptan fotos JPG, PNG o WebP." };
  try {
    const { data, info } = await sharp(Buffer.from(input), { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { ok: true, data, contentType: "image/webp", width: info.width, height: info.height };
  } catch { return { ok: false, error: "No se pudo leer la imagen. Prueba con otra foto." }; }
}

export type ScheduleKind = "biweekly" | "four_weeks" | "six_weeks" | "monthly" | "custom";
export const SCHEDULE_LABEL: Record<ScheduleKind, string> = { biweekly: "Cada 2 semanas", four_weeks: "Cada 4 semanas", six_weeks: "Cada 6 semanas", monthly: "Mensual", custom: "Personalizada" };

/** Mirrors the SQL function photo_due_on(): last photo date (or the schedule anchor) plus the interval. Dates are YYYY-MM-DD. */
export function nextPhotoDue(kind: ScheduleKind, customDays: number | null, anchorOn: string, lastTakenOn: string | null): string {
  const base = new Date((lastTakenOn ?? anchorOn) + "T00:00:00Z");
  if (kind === "monthly") { const d = new Date(base); d.setUTCMonth(d.getUTCMonth() + 1); if (d.getUTCDate() !== base.getUTCDate()) d.setUTCDate(0); return d.toISOString().slice(0, 10); }
  const days = kind === "biweekly" ? 14 : kind === "four_weeks" ? 28 : kind === "six_weeks" ? 42 : customDays ?? 0;
  if (days < 7) throw new RangeError("custom interval must be at least 7 days");
  return new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
}
