import type { NextConfig } from "next";

/**
 * Политика безопасности содержимого (CSP).
 * Строгая часть включена сразу: чужие сайты не могут встроить наш в рамку (кликджекинг), нельзя подменить базовый адрес,
 * формы отправляются только к нам и в платёжные системы, плагины запрещены, всё грузится по https.
 * Полный белый список скриптов и подключений пока работает в режиме «только сообщать» (Report-Only):
 * нарушения приходят в /api/csp-report, ничего не ломается. Когда отчёты станут чистыми — включим и его.
 */
const YA = "https://*.yandex.ru https://*.yandex.net https://yastatic.net https://*.yastatic.net";
const CSP_ENFORCED = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://auth.robokassa.ru https://*.robokassa.ru https://yoomoney.ru https://*.yoomoney.ru https://*.yookassa.ru",
  "upgrade-insecure-requests",
].join("; ");
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline' — встроенные скрипты Next.js; 'wasm-unsafe-eval' — сканер штрихкодов (WebAssembly)
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://mc.yandex.ru https://api-maps.yandex.ru ${YA}`,
  `style-src 'self' 'unsafe-inline' ${YA}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://mc.yandex.ru wss://mc.yandex.ru https://mc.yandex.com ${YA}`,
  "frame-src 'self' https://drive.google.com https://vkvideo.ru https://vk.com https://vk.ru https://rutube.ru https://www.youtube-nocookie.com https://*.yandex.ru",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "report-uri /api/csp-report",
].join("; ");

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
          // Браузер ходит на сайт только по https целый год (поддомены не трогаем)
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Камера — только нашему сайту (сканер штрихкодов); микрофон, оплата через браузер, датчики и прочее — никому
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()",
          },
          // Окно, открытое с чужого сайта, не получает доступ к нашему (оплата в новой вкладке продолжает работать)
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Content-Security-Policy", value: CSP_ENFORCED },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
