import { FRAME_SLUGS } from "./frame-slugs";

export type FigureSex = "male" | "female";
export const FRAME_LABELS = ["Inicio", "Recorrido", "Final"] as const;

/** The model that matches the person: women get the female figure, men the male one; anyone who did not say gets the male one. */
export const figureFor = (sex: string | null | undefined): FigureSex => (sex === "female" ? "female" : "male");

/** The three images (start, middle, end) of an exercise for one figure, or null when that exercise has none. */
export function exerciseFrames(slug: string | null | undefined, sex: FigureSex): string[] | null {
  if (!slug || !FRAME_SLUGS.has(slug)) return null;
  return [1, 2, 3].map((n) => `/exercise-media/${sex}/${slug}/${n}.webp`);
}
