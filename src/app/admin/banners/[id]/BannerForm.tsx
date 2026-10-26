"use client";
import { useActionState, useRef, useState } from "react";
import { PromoSlider } from "@/components/banners/PromoSlider";
import { TopStrip } from "@/components/banners/TopStrip";
import { safeUrl, SLIDE_TONES, STRIP_TONES, type BannerPlace, type PublicBanner } from "@/lib/banners-shared";
import { copyBanner, deleteBanner, saveBanner } from "../actions";

interface B {
  id: string;
  place: BannerPlace;
  label: string;
  title: string;
  text: string;
  image: string | null;
  imageMobile: string | null;
  buttonText: string;
  url: string;
  tone: string;
  countdown: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  clicks: number;
}

const toLocal = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? +new Date(`${v}:00+03:00`) : null);

async function upload(f: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", f);
  const r = await fetch("/api/admin/media?wide=1", { method: "POST", body: fd }).then((x) => x.json());
  if (!r.url) throw new Error(r.error ?? "Не удалось загрузить");
  return r.url as string;
}

function ImageField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">
        {label} — <span className="muted">{hint}</span>
      </span>
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {value && <img src={value} alt="" style={{ width: 150, height: 70, objectFit: "cover" }} />}
        <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? "Загружаем…" : value ? "Заменить" : "Загрузить"}
        </button>
        {value && (
          <button type="button" className="linklike small" onClick={() => onChange("")}>
            Убрать
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setErr(null);
            try {
              onChange(await upload(f));
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Ошибка");
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}

export function BannerForm({ banner: b, place: initialPlace, saved }: { banner: B | null; place: BannerPlace; saved: boolean }) {
  const [state, action, pending] = useActionState(saveBanner, saved ? { ok: "Баннер создан" } : {});
  const [place, setPlace] = useState<BannerPlace>(b?.place ?? initialPlace);
  const [v, setV] = useState({
    label: b?.label ?? "",
    title: b?.title ?? "",
    text: b?.text ?? "",
    image: b?.image ?? "",
    imageMobile: b?.imageMobile ?? "",
    buttonText: b?.buttonText ?? (initialPlace === "HOME" ? "Подробнее" : ""),
    url: b?.url ?? "",
    tone: b?.tone ?? (initialPlace === "STRIP" ? "gold" : "dark"),
    countdown: b?.countdown ?? false,
    startsAt: toLocal(b?.startsAt ?? null),
    endsAt: toLocal(b?.endsAt ?? null),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const strip = place === "STRIP";
  const tones: Record<string, string> = strip ? STRIP_TONES : SLIDE_TONES;
  const tone = v.tone in tones ? v.tone : strip ? "gold" : "dark";

  const preview: PublicBanner = {
    id: b?.id ?? "00000000-0000-0000-0000-000000000000",
    label: v.label,
    title: v.title,
    text: v.text,
    image: strip ? null : v.image || null,
    imageMobile: strip ? null : v.imageMobile || null,
    buttonText: v.buttonText,
    url: safeUrl(v.url) ? "#preview" : "",
    tone,
    endsAt: fromLocal(v.endsAt),
    countdown: v.countdown && !!v.endsAt,
  };
  const showPreview = strip ? !!(v.title || v.text) : !!(v.image || v.title);

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <input type="hidden" name="place" value={place} />
      <input type="hidden" name="image" value={v.image} />
      <input type="hidden" name="imageMobile" value={v.imageMobile} />
      <input type="hidden" name="tone" value={tone} />

      <div className="panel stack">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {(["HOME", "STRIP"] as const).map((p) => (
            <button key={p} type="button" className={`btn btn--sm ${place === p ? "btn--gold" : "btn--line"}`} onClick={() => setPlace(p)} aria-pressed={place === p}>
              {p === "HOME" ? "Слайд на главной" : "Полоса над шапкой"}
            </button>
          ))}
        </div>

        {!strip && (
          <div className="form-grid">
            <ImageField label="Картинка для компьютера" hint="2400×800 px, главное — в правой части" value={v.image} onChange={(x) => setV({ ...v, image: x })} />
            <ImageField label="Картинка для телефона" hint="1080×1080 px, главное — вверху, необязательно" value={v.imageMobile} onChange={(x) => setV({ ...v, imageMobile: x })} />
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            Надпись над заголовком
            <input className="input" name="label" value={v.label} onChange={set("label")} maxLength={40} placeholder="Акция, Новинка, −20%" />
          </label>
          <label className="field">
            {strip ? "Главная фраза" : "Заголовок"}
            <input className="input" name="title" value={v.title} onChange={set("title")} maxLength={140} placeholder={strip ? "Бесплатная доставка от 5 000 ₽" : "Кии ручной работы"} />
          </label>
        </div>
        <label className="field">
          {strip ? "Дополнение (необязательно)" : "Текст под заголовком"}
          {strip ? (
            <input className="input" name="text" value={v.text} onChange={set("text")} maxLength={300} placeholder="до конца месяца по всей России" />
          ) : (
            <textarea className="textarea" name="text" value={v.text} onChange={set("text")} maxLength={300} style={{ minHeight: 70, paddingTop: 10 }} />
          )}
        </label>
        {!strip && !v.title && v.image && <div className="small muted">Без заголовка картинка показывается как есть — удобно, если текст уже нарисован на ней.</div>}

        <div className="form-grid">
          <label className="field">
            Ссылка
            <input className="input" name="url" value={v.url} onChange={set("url")} maxLength={500} placeholder="/catalog/kii или https://…" />
          </label>
          <label className="field">
            Текст кнопки
            <input className="input" name="buttonText" value={v.buttonText} onChange={set("buttonText")} maxLength={40} placeholder="Подробнее" />
          </label>
          <label className="field">
            {strip ? "Цвет полосы" : "Цвет текста"}
            <select className="select" value={tone} onChange={set("tone")}>
              {Object.entries(tones).map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        {v.url && !safeUrl(v.url) && !state.error && <div className="form-error">Ссылка — адрес на сайте, начиная с «/», или https://…</div>}
      </div>

      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Когда показывать</h2>
        <div className="form-grid">
          <label className="field">
            Начало показа (МСК)
            <input className="input" type="datetime-local" name="startsAt" value={v.startsAt} onChange={set("startsAt")} />
          </label>
          <label className="field">
            Окончание показа (МСК)
            <input className="input" type="datetime-local" name="endsAt" value={v.endsAt} onChange={set("endsAt")} />
          </label>
        </div>
        <div className="small muted">Пусто — показывать сразу и без срока.</div>
        <label className="check">
          <input type="checkbox" name="countdown" checked={v.countdown} onChange={set("countdown")} />
          <span>Показывать отсчёт «до конца акции» по времени окончания</span>
        </label>
        <label className="check">
          <input type="checkbox" name="isActive" defaultChecked={b?.isActive ?? true} />
          <span>Включён</span>
        </label>
      </div>

      <div className="panel stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Как будет выглядеть</h2>
        {showPreview ? (
          <div className="banner-preview" key={place}>
            {strip ? <TopStrip items={[preview]} /> : <PromoSlider slides={[preview]} />}
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {strip ? "Напишите текст объявления." : "Загрузите картинку или напишите заголовок."}
          </p>
        )}
        {b && <div className="small muted">Переходов по баннеру: {b.clicks}</div>}
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {b && (
          <button type="button" className="btn btn--line" onClick={() => void copyBanner(b.id)}>
            Сделать копию
          </button>
        )}
        {b && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm("Удалить баннер?")) void deleteBanner(b.id);
            }}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
