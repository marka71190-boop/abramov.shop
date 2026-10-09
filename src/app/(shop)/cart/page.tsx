import Link from "next/link";

export const metadata = { title: "Корзина", robots: { index: false } };

export default function CartPage() {
  return (
    <section className="container doc">
      <h1>Корзина</h1>
      <p className="muted">Корзина и оформление заказа с оплатой ЮKassa и доставкой СДЭК подключаются.</p>
      <Link href="/#catalog" className="btn btn--gold" style={{ marginTop: 16 }}>
        В каталог
      </Link>
    </section>
  );
}
