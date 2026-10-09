import Link from "next/link";
import { CartBadge } from "@/components/cart/CartProvider";
import { IconBag, IconUser } from "@/components/Icons";
import { Logo } from "@/components/Logo";

export function Header({ signedIn, admin }: { signedIn: boolean; admin: boolean }) {
  return (
    <header className="header">
      <div className="container header__inner">
        <Link href="/" className="brand" aria-label="Abramov Shop — на главную">
          <Logo id="header" animated />
          <span className="brand__shop">SHOP</span>
        </Link>
        <nav className="nav" aria-label="Основное меню">
          <Link href="/#catalog">Каталог</Link>
          <Link href="/#drop">Коллекции</Link>
          <Link href="/#bonus">Бонусы</Link>
          <Link href="/p/delivery">Доставка</Link>
          <Link href="/#support">Поддержка</Link>
          {admin && <Link href="/admin">Админка</Link>}
        </nav>
        <div className="header__actions">
          <Link href={signedIn ? "/account" : "/login"} className="icon-btn" aria-label={signedIn ? "Личный кабинет" : "Войти"}>
            <IconUser />
          </Link>
          <Link href="/cart" className="icon-btn" aria-label="Корзина">
            <IconBag />
            <CartBadge />
          </Link>
        </div>
      </div>
    </header>
  );
}
