import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Значок и название сайта, если покупатель добавит его на экран телефона («Установить приложение»). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE.title,
    short_name: SITE.name,
    description: SITE.description,
    lang: "ru",
    start_url: "/?utm_source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["shopping", "sports"],
    prefer_related_applications: false,
    shortcuts: [
      { name: "Каталог", url: "/catalog?utm_source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Корзина", url: "/cart?utm_source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Мои заказы", url: "/account?utm_source=pwa#orders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Подбор кия", url: "/podbor-kiya?utm_source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
