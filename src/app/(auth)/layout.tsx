import Link from "next/link";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieBanner } from "@/components/analytics/CookieBanner";
import { Logo } from "@/components/Logo";

// Номер счётчика читаем при каждом запросе, а не при сборке
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const metrikaId = Number(process.env.YANDEX_METRIKA_ID) || null;
  return (
    <div className="auth">
      <Suspense fallback={null}>
        <Analytics metrikaId={metrikaId} />
      </Suspense>
      <CookieBanner analytics={!!metrikaId} />
      <aside className="auth__brand">
        <div className="stripe stripe--gold" aria-hidden />
        <div className="stripe stripe--silver" aria-hidden />
        <Link href="/" aria-label="Abramov Shop — на главную" style={{ position: "relative" }}>
          <Logo id="auth" animated />
        </Link>
        <div style={{ position: "relative" }}>
          <h2>
            Бонусы
            <br />
            <span className="gold">с первой покупки</span>
          </h2>
          <div className="auth__perks">
            <div>Уровень Silver сразу после регистрации</div>
            <div>История заказов и трек СДЭК в одном месте</div>
            <div>Реферальный код для друзей</div>
          </div>
        </div>
      </aside>
      <main className="auth__main ym-hide-content">{children}</main>
    </div>
  );
}
