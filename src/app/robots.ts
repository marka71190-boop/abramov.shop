import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api", "/login", "/register", "/forgot-password", "/reset-password", "/consent", "/cart", "/checkout", "/order", "/gift/"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
