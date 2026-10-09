import { CartView } from "@/components/cart/CartView";
import { getSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Корзина", robots: { index: false } };

export default async function CartPage() {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  return (
    <section className="container page-pad">
      <h1 className="h2" style={{ marginBottom: 28 }}>
        Корзина
      </h1>
      <CartView signedIn={!!viewer} maxPerItem={settings.checkout.maxQtyPerItem} />
    </section>
  );
}
