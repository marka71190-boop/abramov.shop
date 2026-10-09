import localFont from "next/font/local";

/**
 * Шрифты лежат в проекте — без запросов к Google Fonts (быстрее и без передачи данных за рубеж).
 * Oswald — заголовки, Montserrat — основной текст. Оба с кириллицей и знаком ₽.
 */
export const oswald = localFont({
  src: "./fonts/Oswald-Variable.woff2",
  weight: "200 700",
  display: "swap",
  variable: "--font-oswald",
});

export const montserrat = localFont({
  src: "./fonts/Montserrat-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-montserrat",
});
