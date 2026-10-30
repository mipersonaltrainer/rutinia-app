import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rutinia", short_name: "Rutinia", lang: "es-CO", dir: "ltr",
    description: "Evolución en cada repetición: evalúa, planifica, registra y mide el progreso de tu entrenamiento.",
    start_url: "/login", scope: "/", id: "/", display: "standalone", orientation: "portrait",
    background_color: "#050505", theme_color: "#050505",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
