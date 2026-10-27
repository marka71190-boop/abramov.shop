import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Сборка в одну папку для запуска на сервере Timeweb (node .next/standalone/server.js)
  output: "standalone",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // www.abramov.shop → abramov.shop (один адрес для поисковиков, входа и оплаты)
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.abramov.shop" }],
        destination: "https://abramov.shop/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Сервис-воркер приложения: браузер должен сразу видеть новую версию
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
