import { exerciseVideoUrl } from "@/lib/exercises/video";

/** Short looping demonstration of the movement. Nothing downloads until the person presses play (preload="none"), which keeps mobile data use low. */
export function ExerciseVideo({ path, name, className = "" }: { path: string | null | undefined; name: string; className?: string }) {
  const src = exerciseVideoUrl(path);
  if (!src) return null;
  return (
    <video className={`aspect-video w-full rounded-lg bg-black ${className}`} src={src} controls loop muted playsInline preload="none" aria-label={`Video de cómo se hace: ${name}`}>
      Tu navegador no puede reproducir este video.
    </video>
  );
}
