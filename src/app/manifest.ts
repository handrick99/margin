import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Margin",
    short_name: "Margin",
    description: "Park stray thoughts until the sitting is over.",
    start_url: "/",
    display: "standalone",
    background_color: "#272727",
    theme_color: "#272727",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
