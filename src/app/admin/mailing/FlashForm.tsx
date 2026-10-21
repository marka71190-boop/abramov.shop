"use client";
import { useActionState, useState } from "react";
import { createFlashAction } from "./actions";

/** «Акция по таймеру»: промокод на N часов + готовый черновик рассылки */
export function FlashForm({ telegram }: { telegram: boolean }) {
  const [state, action, pending] = useActionState(createFlashAction, {});
  const [type, setType] = useState("FREE_SHIPPING");
  return (
    <form action={action} className="panel stack">
      <div>
        <h2 style={{ margin: 0 }}>⚡ Акция по таймеру</h2>
        <p className="muted small" style={{ margin: "6px 0 0" }}>
          Создадим промокод и черновик рассылки всем подписчикам. У каждого получателя промокод действует указанное время с момента, как пришло его
          письмо, — в письме будет «до 21:30», на сайте — обратный отсчёт. Остальным промокод не подойдёт. Перед запуском можно поправить текст и
          отправить тест себе.
        </p>
      </div>
      <div className="form-grid">
        <label className="field">
          Что даём
          <select className="select" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="FREE_SHIPPING">Бесплатная доставка</option>
            <option value="PERCENT">Скидка, %</option>
            <option value="FIXED">Скидка, ₽</option>
          </select>
        </label>
        {type !== "FREE_SHIPPING" && (
          <label className="field">
            {type === "PERCENT" ? "Скидка, %" : "Скидка, ₽"}
            <input className="input" name="value" inputMode="decimal" required />
          </label>
        )}
        <label className="field">
          Сколько часов действует
          <input className="input" name="hours" type="number" min={1} max={72} defaultValue={3} required />
        </label>
        <label className="field">
          Сколько раз можно применить всего
          <input className="input" name="maxUses" type="number" min={1} placeholder="без ограничения" />
          <span className="muted small">Пусто — без ограничений. Один покупатель — один раз.</span>
        </label>
        <label className="field">
          Минимальная сумма товаров, ₽
          <input className="input" name="minOrder" type="number" min={0} placeholder="без ограничения" />
        </label>
      </div>
      {telegram && (
        <label className="check">
          <input type="checkbox" name="channelTelegram" />
          <span>Ещё и в Telegram подписчикам, у которых подключён бот</span>
        </label>
      )}
      {state.error && <div className="form-error">{state.error}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Создаём…" : "Создать промокод и рассылку"}
        </button>
      </div>
    </form>
  );
}
