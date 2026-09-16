import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "blood against blackout",
    short_name: "blood against blackout",
    description: "Find A.A., N.A., and C.A. meetings. Privacy-first, not affiliated with World Services.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    categories: ["health", "lifestyle", "navigation"],
    background_color: "#140018",
    theme_color: "#140018",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "nearby meetings",
        short_name: "nearby",
        url: "/",
      },
      {
        name: "online meetings",
        short_name: "online",
        url: "/online",
      },
    ],
  };
}
