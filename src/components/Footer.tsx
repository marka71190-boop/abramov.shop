import Link from "next/link";
import { SELLER } from "@/lib/site";

interface Props {
  pages: { slug: string; title: string }[];
  telegram: string;
  email: string;
}

export function Footer({ pages, telegram, email }: Props) {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__col">
          <div className="display" style={{ fontSize: 24, letterSpacing: "0.14em" }}>
            <span className="gold">ABRAMOV</span> SHOP
          </div>
          <div className="muted">
            Telegram: <a href={`https://t.me/${telegram}`}>@{telegram}</a>
            <br />
            Почта: <a href={`mailto:${email}`}>{email}</a>
          </div>
        </div>
        <div className="footer__col">
          <div className="footer__title">Магазин</div>
          <Link href="/#catalog">Каталог</Link>
          <Link href="/#bonus">Бонусная программа</Link>
          <Link href="/account">Личный кабинет</Link>
        </div>
        <div className="footer__col">
          <div className="footer__title">Покупателям</div>
          {pages.map((p) => (
            <Link key={p.slug} href={`/p/${p.slug}`}>
              {p.title}
            </Link>
          ))}
        </div>
        <div className="footer__col footer__legal">
          <div className="footer__title">Реквизиты</div>
          <div>{SELLER.name}</div>
          <div>ИНН {SELLER.inn}</div>
          <div>ОГРНИП {SELLER.ogrnip}</div>
          <div>Юр. адрес: {SELLER.legalAddress}</div>
          <div>Факт. адрес: {SELLER.actualAddress}</div>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} Abramov Shop</span>
        <span>Оплата через ЮKassa · Доставка СДЭК</span>
      </div>
    </footer>
  );
}
