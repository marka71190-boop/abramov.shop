import type { Metadata, Viewport } from "next";
import { DEFAULT_OG } from "@/lib/seo";
import { SITE } from "@/lib/site";
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
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
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
