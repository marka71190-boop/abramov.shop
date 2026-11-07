/** Касса как приложение на рабочем телефоне: значок на экране, открывается сразу в кассе на весь экран */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      id: "/kassa",
      name: "Касса Abramov Shop",
      short_name: "Касса",
      description: "Касса клуба: продажи, смены, возвраты",
      lang: "ru",
      start_url: "/kassa?utm_source=pwa-kassa",
      scope: "/kassa",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
