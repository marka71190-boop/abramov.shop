import Link from "next/link";
import { CartBadge } from "@/components/cart/CartProvider";
import { IconBag, IconUser } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { HeaderSearch } from "@/components/search/HeaderSearch";

export function Header({
  signedIn,
  admin,
  categories,
  cue = false,
  club = false,
  coach = false,
}: {
  signedIn: boolean;
  admin: boolean;
  /** Администратор клуба — ссылка на раздел выдачи */
  club?: boolean;
  /** Тренер — ссылка на кабинет тренера */
  coach?: boolean;
  cue?: boolean;
  categories: { slug: string; name: string }[];
}) {
  return (
    <header className="header">
      <div className="container header__inner">
        <Link href="/" className="brand" aria-label="Abramov Shop — на главную">
          <Logo id="header" animated />
          <span className="brand__shop">SHOP</span>
        </Link>
        <nav className="nav" aria-label="Основное меню">
          <Link href="/catalog">Каталог</Link>
          {cue && <Link href="/cue">Кий на заказ</Link>}
          <Link href="/service">Мастерская</Link>
          <Link href="/trenirovki">Тренировки</Link>
          {/* Второстепенные пункты прячем на узких экранах — они есть в подвале */}
          <Link href="/#bonus" className="nav__minor">
            Бонусы
          </Link>
          <Link href="/gift" className="nav__minor">
            Сертификаты
          </Link>
          <Link href="/p/delivery" className="nav__minor">
            Доставка
          </Link>
          <Link href="/#support" className="nav__minor2">
            Поддержка
          </Link>
          {admin && <Link href="/admin">Админка</Link>}
          {club && <Link href="/club">Клуб</Link>}
          {coach && <Link href="/coach">Тренер</Link>}
        </nav>
        <div className="header__actions">
          <HeaderSearch categories={categories} />
          {signedIn ? (
            <Link href="/account" className="icon-btn" aria-label="Личный кабинет">
              <IconUser />
            </Link>
          ) : (
            <Link href="/login" className="icon-btn header__login" aria-label="Войти или зарегистрироваться">
              <IconUser />
              <span className="header__login-text">Войти</span>
            </Link>
          )}
          <Link href="/cart" className="icon-btn" aria-label="Корзина">
            <IconBag />
            <CartBadge />
          </Link>
        </div>
      </div>
    </header>
  );
}
