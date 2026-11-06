import Link from "next/link";
import { clubTitle } from "@/lib/club-label";
import { listClubs } from "@/lib/clubs";
import { fmtDateTime } from "@/lib/format";
import { listDevices } from "@/lib/kassa-devices";
import { requireAdmin } from "@/lib/viewer";
import { CreateDevice, DeviceCard } from "./DeviceForms";

export const metadata = { title: "Телефоны кассы" };

/** Рабочие телефоны кассы: владелец сам выдаёт аккаунт — только касса одного клуба */
export default async function KassaDevices() {
  await requireAdmin("OWNER");
  const [devices, clubs] = await Promise.all([listDevices(), listClubs().catch(() => [])]);
  const active = clubs.filter((c) => c.isActive).map((c) => ({ id: c.id, title: clubTitle(c) }));
  const titleOf = (id: string | null) => active.find((c) => c.id === id)?.title ?? "клуб не выбран";
  // Свободный логин по порядку: kassa1, kassa2…
  const used = new Set(devices.map((d) => d.login));
  let n = 1;
  while (used.has(`kassa${n}`)) n++;

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/pos">← Касса</Link>
      </p>
      <h1>Телефоны кассы</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
        Аккаунт для рабочего телефона в клубе: только касса этого клуба — без заказов, личного кабинета и бонусов. Почта не нужна: вход по логину и паролю на{" "}
        <b>abramov.shop/kassa/login</b>. При открытии смены касса спросит, кто сегодня работает, — недостача будет видна по человеку в «Сменах».
      </p>

      {active.length ? <CreateDevice clubs={active} suggest={`kassa${n}`} /> : <div className="notice">Сначала добавьте клуб: Админка → «Клубы».</div>}

      {devices.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2 style={{ margin: 0 }}>Телефоны · {devices.length}</h2>
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              clubs={active}
              device={{
                id: d.id,
                name: d.name,
                login: d.login,
                clubId: d.clubId,
                active: d.active,
                lastSeen: d.lastSeen ? fmtDateTime(d.lastSeen) : null,
                openShift: d.openShift
                  ? `с ${fmtDateTime(d.openShift.openedAt)}${d.openShift.staffName ? ` — ${d.openShift.staffName}` : ""} · ${titleOf(d.openShift.clubId)}`
                  : null,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
