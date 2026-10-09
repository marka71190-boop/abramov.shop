"use client";
import { useActionState, useState } from "react";
import { savePromo } from "../shop-actions";

export interface PromoRow {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minOrder: number | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  firstOrderOnly: boolean;
  categoryId: string | null;
  combinableWithBonus: boolean;
  note: string | null;
}

const day = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 10) : "");

export function PromoForm({ promo, categories, saved }: { promo: PromoRow | null; categories: { id: string; name: string }[]; saved?: boolean }) {
  const [state, action, pending] = useActionState(savePromo, saved ? { ok: "Промокод создан" } : {});
  const [type, setType] = useState(promo?.type ?? "PERCENT");
  return (
    <form action={action} className="stack">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <div className="form-grid">
        <label className="field">
          Код (покупатель вводит его при оформлении)
          <input className="input" name="code" defaultValue={promo?.code} required placeholder="ABRAMOV10" style={{ textTransform: "uppercase" }} />
        </label>
        <label className="field">
          Тип
          <select className="select" name="type" value={type} onChange={(e) => setType(e.target.value as PromoRow["type"])}>
            <option value="PERCENT">Скидка в %</option>
            <option value="FIXED">Скидка в рублях</option>
            <option value="FREE_SHIPPING">Бесплатная доставка</option>
          </select>
        </label>
        {type !== "FREE_SHIPPING" && (
          <label className="field">
            {type === "PERCENT" ? "Скидка, %" : "Скидка, ₽"}
            <input
              className="input"
              name="value"
              type="number"
              min={1}
              required
              defaultValue={promo ? (promo.type === "FIXED" ? promo.value / 100 : promo.type === "PERCENT" ? promo.value : "") : ""}
            />
          </label>
        )}
        <label className="field">
          Минимальная сумма товаров, ₽
          <input className="input" name="minOrder" type="number" min={0} defaultValue={promo?.minOrder != null ? promo.minOrder / 100 : ""} placeholder="без ограничения" />
        </label>
        <label className="field">
          Всего применений
          <input className="input" name="maxUses" type="number" min={1} defaultValue={promo?.maxUses ?? ""} placeholder="без ограничения" />
        </label>
        <label className="field">
          Раз на одного клиента
          <input className="input" name="maxUsesPerUser" type="number" min={1} defaultValue={promo ? (promo.maxUsesPerUser ?? "") : 1} placeholder="без ограничения" />
        </label>
        <label className="field">
          Действует с
          <input className="input" name="startsAt" type="date" defaultValue={day(promo?.startsAt ?? null)} />
        </label>
        <label className="field">
          Действует по (включительно)
          <input className="input" name="endsAt" type="date" defaultValue={day(promo?.endsAt ?? null)} />
        </label>
        <label className="field">
          Только на категорию
          <select className="select" name="categoryId" defaultValue={promo?.categoryId ?? ""}>
            <option value="">На весь заказ</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Заметка для себя
          <input className="input" name="note" defaultValue={promo?.note ?? ""} placeholder="Для блогера Ивана" />
        </label>
      </div>
      <div className="row" style={{ gap: 24 }}>
        <label className="check">
          <input type="checkbox" name="isActive" defaultChecked={promo?.isActive ?? true} />
          <span>Включён</span>
        </label>
        <label className="check">
          <input type="checkbox" name="combinableWithBonus" defaultChecked={promo?.combinableWithBonus ?? true} />
          <span>Можно вместе с бонусами</span>
        </label>
        <label className="check">
          <input type="checkbox" name="firstOrderOnly" defaultChecked={promo?.firstOrderOnly ?? false} />
          <span>Только на первый заказ</span>
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : promo ? "Сохранить" : "Создать промокод"}
        </button>
      </div>
    </form>
  );
}

export function PromoToggle({ id, on, action }: { id: string; on: boolean; action: (id: string, v: boolean) => Promise<void> }) {
  const [v, setV] = useState(on);
  return (
    <button
      type="button"
      className="toggle"
      aria-pressed={v}
      aria-label="Включён"
      onClick={async () => {
        setV(!v);
        await action(id, !v);
      }}
    >
      <span />
    </button>
  );
}
