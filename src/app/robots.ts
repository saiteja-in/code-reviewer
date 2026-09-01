import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/repos",
        "/reviews",
        "/login",
        "/verify-request",
        "/connect-github",
        "/api/",
      ],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
