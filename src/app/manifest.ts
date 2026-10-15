import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Значок и название сайта, если покупатель добавит его на экран телефона («Установить приложение»). */
export default function manifest(): MetadataRoute.Manifest {
  return {
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
    shortcuts: [
      { name: "Каталог", url: "/catalog" },
      { name: "Корзина", url: "/cart" },
      { name: "Мои заказы", url: "/account#orders" },
    ],
  };
}
