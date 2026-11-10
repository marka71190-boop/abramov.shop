import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Сборка в одну папку для запуска на сервере Timeweb (node .next/standalone/server.js)
  output: "standalone",
  poweredByHeader: false,
  // Раскодировщик HEIC (фото с iPhone) — WebAssembly, грузим как есть из node_modules, без сборки
  serverExternalPackages: ["heic-decode", "libheif-js"],
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
        // Заставки приложения на iPhone: меняются редко, телефон берёт их один раз при установке
        source: "/splash/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
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
