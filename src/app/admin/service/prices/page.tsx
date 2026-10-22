import Link from "next/link";
import { servicePrices } from "@/lib/service";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { ServiceItemForm, ServiceSettingsForm } from "./Forms";

export default async function ServicePricesAdmin() {
  await requireAdmin("OWNER");
  const [items, settings] = await Promise.all([servicePrices(true), getSettings()]);
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/service">← Мастерская</Link>
      </p>
      <h1>Прайс мастерской</h1>
      <ServiceSettingsForm s={settings.service} />
      <h2 style={{ margin: "12px 0 0" }}>Услуги</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Покупатель видит их на странице <Link href="/service">/service</Link> и выбирает в заявке. Срок — сколько дней работы после того, как кий попал к мастеру.
      </p>
      {items.map((i) => (
        <ServiceItemForm key={i.id} item={{ id: i.id, name: i.name, description: i.description, price: i.price, priceFrom: i.priceFrom, days: i.days, isActive: i.isActive, sortOrder: i.sortOrder }} />
      ))}
      <ServiceItemForm item={null} />
    </>
  );
}
