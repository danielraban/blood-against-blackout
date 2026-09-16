import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const publicRoutes = ["", "/online", "/resources", "/coverage", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteUrl().origin;
  return publicRoutes.map((path, index) => ({
    url: `${origin}${path || "/"}`,
    changeFrequency: index === 0 ? "daily" : "weekly",
    priority: index === 0 ? 1 : 0.7,
  }));
}
