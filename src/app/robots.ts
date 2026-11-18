import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

/** Public marketing pages and the user manual are crawlable; the app, admin and every church's private links are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app", "/admin", "/api/", "/iclock/",
          "/book", "/checkin", "/children", "/counsel", "/give", "/giving-letter", "/invite", "/join",
          "/offline", "/pray", "/reset-link", "/teens", "/testify", "/visit",
          "/sign-in", "/sign-up", "/verify-phone", "/email-preferences",
        ],
      },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
