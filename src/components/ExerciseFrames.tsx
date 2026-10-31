"use client";
import { useState } from "react";
import Image from "next/image";
import { exerciseFrames, FRAME_LABELS, type FigureSex } from "@/lib/exercises/frames";

/** The movement in three steps with a mannequin. `picker` lets a trainer switch between the male and female figure; a client only sees their own. */
export function ExerciseFrames({ slug, name, sex, picker = false }: { slug: string | null | undefined; name: string; sex: FigureSex; picker?: boolean }) {
  const [figure, setFigure] = useState<FigureSex>(sex);
  const urls = exerciseFrames(slug, figure);
  if (!urls) return null;
  return (
    <figure className="space-y-2">
      <ol className="grid grid-cols-3 gap-2">
        {urls.map((u, i) => (
          <li key={u} className="overflow-hidden rounded-lg bg-[var(--surface-2)]">
            <Image src={u} alt={`${name}: ${FRAME_LABELS[i].toLowerCase()} del movimiento`} width={480} height={480} unoptimized loading="lazy" className="h-auto w-full" />
            <p className="px-2 pb-1 text-center text-[11px] text-[var(--muted)]">{i + 1}. {FRAME_LABELS[i]}</p>
          </li>
        ))}
      </ol>
      {picker && (
        <div role="group" aria-label="Modelo" className="flex gap-2 text-sm">
          {(["male", "female"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={figure === f} onClick={() => setFigure(f)} className={`min-h-11 rounded-lg border px-3 ${figure === f ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>{f === "male" ? "Modelo hombre" : "Modelo mujer"}</button>
          ))}
        </div>
      )}
      <figcaption className="text-[11px] text-[var(--muted)]">Ilustración de referencia del movimiento; la técnica detallada está en las instrucciones.</figcaption>
    </figure>
  );
}
