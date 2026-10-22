import { SITE } from "@/lib/site";

/**
 * robots.txt. Clean-param — подсказка Яндексу: метки рассылок, промокоды и ссылки «приведи друга»
 * не создают новых страниц, индексировать надо адрес без них.
 */
const DISALLOW = ["/admin", "/account", "/api", "/login", "/register", "/forgot-password", "/reset-password", "/consent", "/cart", "/checkout", "/order", "/gift/", "/unsubscribe", "/cue/thumb", "/service/"];

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((d) => `Disallow: ${d}`),
    "",
    "User-agent: Yandex",
    "Allow: /",
    ...DISALLOW.map((d) => `Disallow: ${d}`),
    "Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&promo&ref&yclid&gclid",
    "",
    `Sitemap: ${SITE.url}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
