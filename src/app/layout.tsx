import type { Metadata, Viewport } from "next";
import { DEFAULT_OG } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { SPLASH } from "@/lib/splash";
import { montserrat, oswald } from "./fonts";
import "./globals.css";
import { SwRegister } from "@/components/pwa/SwRegister";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s — ${SITE.name}` },
  description: SITE.description,
  openGraph: { type: "website", locale: SITE.locale, siteName: SITE.name, title: SITE.title, description: SITE.description, images: [DEFAULT_OG] },
  twitter: { card: "summary_large_image" },
  applicationName: SITE.name,
  // startupImage — заставка с логотипом при запуске приложения на iPhone вместо белого экрана
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black-translucent", startupImage: SPLASH },
  formatDetection: { telephone: false },
  // Подтверждение прав на сайт в Яндекс Вебмастере и Google Search Console (код из мета-тега — в переменные Timeweb)
  verification: {
    yandex: process.env.YANDEX_VERIFICATION || undefined,
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${oswald.variable} ${montserrat.variable}`}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
