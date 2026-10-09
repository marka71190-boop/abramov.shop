import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
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
      <main className="auth__main">{children}</main>
    </div>
  );
}
