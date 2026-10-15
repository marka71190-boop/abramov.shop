"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { copyCampaign, deleteCampaign, launchCampaign, saveCampaign, stopCampaign, testCampaign, type MailingState } from "./actions";

export interface PromoOption {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number; // % или копейки
  minOrder: number | null;
  endsAt: string | null; // «31.10.2026»
  problem: string | null;
}

export interface CampaignData {
  id: string;
  subject: string;
  title: string;
  body: string;
  promoCodeId: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  channelEmail: boolean;
  channelTelegram: boolean;
  onlyVerified: boolean;
}

const rubles = (kop: number) => `${Math.round(kop / 100).toLocaleString("ru-RU")} ₽`;

/** Готовый текст под промокод — подставляется при выборе, дальше можно править. */
function template(p: PromoOption) {
  const until = p.endsAt ? ` до ${p.endsAt}` : "";
  const from = p.minOrder ? ` при заказе от ${rubles(p.minOrder)}` : "";
  if (p.type === "FREE_SHIPPING")
    return {
      subject: `Бесплатная доставка по промокоду ${p.code}`,
      title: "Доставим бесплатно",
      body: `Дарим бесплатную доставку СДЭК по всей России — в пункт выдачи или курьером${from}.\nВведите промокод при оформлении заказа — он действует${until || " ограниченное время"}.`,
    };
  const amount = p.type === "PERCENT" ? `${p.value}%` : rubles(p.value);
  return {
    subject: `Скидка ${amount} по промокоду ${p.code}`,
    title: `Скидка ${amount} для вас`,
    body: `Дарим скидку ${amount} на заказ${from}.\nВведите промокод при оформлении — он действует${until || " ограниченное время"}.`,
  };
}

export function MailingForm({
  campaign,
  promos,
  saved,
  mail,
  telegram,
}: {
  campaign: CampaignData | null;
  promos: PromoOption[];
  saved: boolean;
  mail: boolean;
  telegram: boolean;
}) {
  const [state, action, pending] = useActionState(saveCampaign, saved ? { ok: "Сохранено. Отправьте тест себе и запускайте." } : {});
  const [promoId, setPromoId] = useState(campaign?.promoCodeId ?? "");
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  // Пока админ не правил текст руками — при смене промокода подставляем новый шаблон
  const touched = useRef(!!campaign);
  const promo = promos.find((p) => p.id === promoId);

  function pickPromo(id: string) {
    setPromoId(id);
    const p = promos.find((x) => x.id === id);
    if (p && (!touched.current || (!subject && !title && !body))) {
      const t = template(p);
      setSubject(t.subject);
      setTitle(t.title);
      setBody(t.body);
    }
  }
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    touched.current = true;
    set(e.target.value);
  };

  return (
    <form action={action} className="panel stack">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <label className="field">
        Промокод
        <select className="select" name="promoCodeId" value={promoId} onChange={(e) => pickPromo(e.target.value)}>
          <option value="">— без промокода (просто новость) —</option>
          {promos.map((p) => (
            <option key={p.id} value={p.id} disabled={!!p.problem && p.id !== promoId}>
              {p.code} — {p.type === "FREE_SHIPPING" ? "бесплатная доставка" : p.type === "PERCENT" ? `${p.value}%` : rubles(p.value)}
              {p.problem ? " (недоступен)" : ""}
            </option>
          ))}
        </select>
        {promo?.problem ? (
          <span className="small" style={{ color: "var(--c-danger)" }}>
            {promo.problem}
          </span>
        ) : (
          <span className="muted small">
            Код крупно покажется в письме, а кнопка откроет сайт с уже подставленным промокодом. Новый промокод создайте в разделе «Промокоды».
          </span>
        )}
      </label>
      <label className="field">
        Тема письма
        <input className="input" name="subject" value={subject} onChange={edit(setSubject)} required maxLength={150} />
      </label>
      <label className="field">
        Заголовок в письме
        <input className="input" name="title" value={title} onChange={edit(setTitle)} required maxLength={120} />
      </label>
      <label className="field">
        Текст
        <textarea className="textarea" name="body" value={body} onChange={edit(setBody)} maxLength={4000} style={{ minHeight: 140 }} />
        <span className="muted small">Обращение «Здравствуйте, Имя!» добавится само. Переносы строк сохраняются.</span>
      </label>
      <div className="form-grid">
        <label className="field">
          Текст кнопки
          <input className="input" name="buttonText" defaultValue={campaign?.buttonText ?? ""} maxLength={40} placeholder="Выбрать товары" />
        </label>
        <label className="field">
          Куда ведёт кнопка
          <input className="input" name="buttonUrl" defaultValue={campaign?.buttonUrl ?? ""} maxLength={300} placeholder="/catalog" />
        </label>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label className={`check${mail ? "" : " check--off"}`}>
          <input type="checkbox" name="channelEmail" defaultChecked={campaign ? campaign.channelEmail : mail} disabled={!mail} />
          <span>На почту{mail ? "" : " — почта на сайте не настроена"}</span>
        </label>
        <label className={`check${telegram ? "" : " check--off"}`}>
          <input type="checkbox" name="channelTelegram" defaultChecked={campaign?.channelTelegram ?? false} disabled={!telegram} />
          <span>В Telegram — тем, кто подключил бота{telegram ? "" : " (бот не подключён)"}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="onlyVerified" defaultChecked={campaign?.onlyVerified ?? false} />
          <span>Только тем, кто подтвердил почту — меньше риск попасть в «Спам»</span>
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Сохраняем…" : campaign ? "Сохранить" : "Сохранить черновик"}
        </button>
      </div>
    </form>
  );
}

/** Кнопки черновика: тест себе, запуск, удаление. */
export function DraftControls({ id, recipients }: { id: string; recipients: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<MailingState>({});
  const run = (fn: () => Promise<MailingState | void>) => start(async () => setMsg((await fn()) ?? {}));
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--line" disabled={pending} onClick={() => run(() => testCampaign(id))}>
          Отправить тест себе
        </button>
        <button
          type="button"
          className="btn btn--gold"
          disabled={pending || recipients === 0}
          onClick={() => {
            if (confirm(`Запустить рассылку? Получателей: ${recipients}. Остановить можно, но уже отправленные письма не вернуть.`))
              run(() => launchCampaign(id));
          }}
        >
          Запустить — {recipients} получ.
        </button>
        <button
          type="button"
          className="btn btn--line btn--danger"
          disabled={pending}
          onClick={() => confirm("Удалить черновик?") && run(() => deleteCampaign(id))}
        >
          Удалить
        </button>
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
    </div>
  );
}

/** Кнопки запущенной рассылки: остановить, копировать; пока идёт отправка — страница обновляется сама. */
export function RunControls({ id, sending }: { id: string; sending: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<MailingState>({});
  const router = useRouter();
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [sending, router]);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        {sending && (
          <button
            type="button"
            className="btn btn--line btn--danger"
            disabled={pending}
            onClick={() => confirm("Остановить рассылку? Оставшимся письма не уйдут.") && start(async () => setMsg(await stopCampaign(id)))}
          >
            Остановить
          </button>
        )}
        <button type="button" className="btn btn--line" disabled={pending} onClick={() => start(() => copyCampaign(id))}>
          Сделать копию
        </button>
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
    </div>
  );
}
