"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useQuote } from "@/components/cart/useQuote";
import { num, rub } from "@/lib/format";
import { placeOrderAction } from "./actions";

interface City {
  code: number;
  name: string;
}
interface Point {
  code: string;
  name: string;
  address: string;
  workTime: string;
  postalCode: string | null;
}

interface Props {
  user: { name: string; phone: string; email: string; bonus: number };
  canReferral: boolean;
  delivery: { pvz: boolean; courier: boolean; cdek: boolean };
  maxPerItem: number;
  canPay: boolean;
  testMode: boolean;
  docs: { offer: boolean; returns: boolean };
}

function CityPicker({ value, onChange }: { value: City | null; onChange: (c: City | null) => void }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [list, setList] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (value && q === value.name) return;
    if (q.trim().length < 2) {
      setList([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/delivery/cities?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then((x) => x.json());
        if (r.ok) {
          setList(r.cities);
          setErr(null);
          setOpen(true);
        } else setErr(r.error);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, value]);

  return (
    <div className="suggest">
      <label className="field">
        Город
        <input
          className="input"
          value={q}
          placeholder="Начните вводить: Краснодар"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls="city-list"
          onChange={(e) => {
            setQ(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => list.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </label>
      {err && <div className="small" style={{ color: "var(--c-danger)", marginTop: 6 }}>{err}</div>}
      {open && list.length > 0 && (
        <ul className="suggest__list" id="city-list" role="listbox">
          {list.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={value?.code === c.code}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c);
                  setQ(c.name);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PointPicker({ city, value, onChange }: { city: City; value: Point | null; onChange: (p: Point | null) => void }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setPoints(null);
    setErr(null);
    fetch(`/api/delivery/points?city=${city.code}`)
      .then((x) => x.json())
      .then((r) => (r.ok ? setPoints(r.points) : setErr(r.error)))
      .catch(() => setErr("Не удалось загрузить пункты выдачи"));
  }, [city.code]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (points ?? []).filter((p) => !f || `${p.address} ${p.name}`.toLowerCase().includes(f)).slice(0, 60);
  }, [points, filter]);

  if (value) {
    return (
      <div className="picked">
        <div>
          <div style={{ fontWeight: 600 }}>{value.address}</div>
          <div className="muted small">
            СДЭК {value.code}
            {value.workTime ? ` · ${value.workTime}` : ""}
          </div>
        </div>
        <button type="button" className="linklike small" onClick={() => onChange(null)}>
          Изменить
        </button>
      </div>
    );
  }
  if (err) return <div className="form-error">{err}</div>;
  if (!points) return <div className="muted small">Загружаем пункты выдачи…</div>;
  if (!points.length) return <div className="form-error">В этом городе нет пунктов выдачи СДЭК — выберите доставку курьером.</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <input className="input" placeholder={`Улица или метро — ${points.length} пунктов`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="pvz-list" role="listbox" aria-label="Пункты выдачи">
        {shown.map((p) => (
          <li key={p.code}>
            <button type="button" role="option" aria-selected={false} onClick={() => onChange(p)}>
              <span style={{ fontWeight: 600 }}>{p.address}</span>
              <span className="muted small">{p.workTime || p.name}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="muted small" style={{ padding: 12 }}>Ничего не нашли — уточните запрос</li>}
      </ul>
    </div>
  );
}

export function CheckoutForm({ user, canReferral, delivery, canPay, testMode, docs }: Props) {
  const cart = useCart();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [comment, setComment] = useState("");
  const [type, setType] = useState<"PVZ" | "COURIER">(delivery.pvz ? "PVZ" : "COURIER");
  const [city, setCity] = useState<City | null>(null);
  const [cityText, setCityText] = useState(""); // если СДЭК ещё не подключён
  const [point, setPoint] = useState<Point | null>(null);
  const [pvzText, setPvzText] = useState("");
  const [address, setAddress] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [useBonus, setUseBonus] = useState(false);
  const [referral, setReferral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const r = localStorage.getItem("as_ref");
      if (r && canReferral) setReferral(r);
    } catch {}
  }, [canReferral]);

  const deliveryInput = delivery.cdek
    ? city
      ? { type, cityCode: city.code, cityName: city.name.split(",")[0], pvzCode: point?.code, pvzAddress: point?.address, address, postalCode: point?.postalCode }
      : null
    : cityText.trim()
      ? { type, cityName: cityText.trim(), pvzAddress: pvzText.trim() || null, address }
      : null;

  const { quote, error: quoteError, loading, setQuote } = useQuote(
    { promoCode: promo, useBonus, delivery: deliveryInput ? { ...deliveryInput, address: undefined, pvzAddress: undefined } : null },
    [promo, useBonus, type, city?.code, delivery.cdek ? "" : cityText.trim()],
  );

  useEffect(() => {
    if (!quote || !promo) return;
    if (quote.promoError) {
      setPromoMsg(quote.promoError);
      setPromo(null);
    } else setPromoMsg(null);
  }, [quote, promo]);

  if (cart.ready && !cart.items.length && !submitting) {
    return (
      <div className="panel empty-cart">
        <p className="h3">Корзина пуста</p>
        <Link href="/#catalog" className="btn btn--gold">
          В каталог
        </Link>
      </div>
    );
  }

  const needPoint = type === "PVZ" && delivery.cdek && !point;
  const needAddress = type === "COURIER" && address.trim().length < 5;
  const ready = !!quote && !!quote.shipping && !quote.shippingError && !!deliveryInput && !needPoint && !needAddress && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !deliveryInput) return;
    setSubmitting(true);
    setError(null);
    const r = await placeOrderAction({
      lines: cart.items,
      promoCode: promo,
      useBonus,
      delivery: deliveryInput,
      name,
      phone,
      email,
      comment,
      referralCode: referral || null,
      expectedTotal: quote.total,
    }).catch(() => ({ error: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз" }) as const);
    if ("payUrl" in r && r.payUrl) {
      try {
        localStorage.removeItem("as_ref");
      } catch {}
      cart.clear();
      window.location.href = r.payUrl;
      return;
    }
    setSubmitting(false);
    setError(r.error ?? "Ошибка");
    if ("quote" in r && r.quote) setQuote(r.quote);
    requestAnimationFrame(() => errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <div className="checkout__main">
        <fieldset className="panel stack">
          <legend className="step">
            <span>1</span> Получатель
          </legend>
          <div className="form-grid">
            <label className="field">
              Имя и фамилия
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
            </label>
            <label className="field">
              Телефон
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" autoComplete="tel" placeholder="+7 900 123-45-67" />
            </label>
            <label className="field">
              Почта — для чека
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required type="email" autoComplete="email" />
            </label>
          </div>
        </fieldset>

        <fieldset className="panel stack">
          <legend className="step">
            <span>2</span> Доставка СДЭК
          </legend>
          <div className="seg" role="radiogroup" aria-label="Способ доставки">
            {delivery.pvz && (
              <button type="button" role="radio" aria-checked={type === "PVZ"} onClick={() => setType("PVZ")}>
                <strong>Пункт выдачи</strong>
                <span>дешевле, забрать в удобное время</span>
              </button>
            )}
            {delivery.courier && (
              <button type="button" role="radio" aria-checked={type === "COURIER"} onClick={() => setType("COURIER")}>
                <strong>Курьер</strong>
                <span>до двери</span>
              </button>
            )}
          </div>

          {delivery.cdek ? (
            <CityPicker
              value={city}
              onChange={(c) => {
                setCity(c);
                setPoint(null);
              }}
            />
          ) : (
            <label className="field">
              Город
              <input className="input" value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder="Краснодар" />
            </label>
          )}

          {type === "PVZ" && delivery.cdek && city && <PointPicker city={city} value={point} onChange={setPoint} />}
          {type === "PVZ" && !delivery.cdek && (
            <label className="field">
              Адрес пункта СДЭК, если знаете
              <input className="input" value={pvzText} onChange={(e) => setPvzText(e.target.value)} placeholder="ул. Красная, 176" />
            </label>
          )}
          {type === "COURIER" && (
            <label className="field">
              Адрес: улица, дом, квартира
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="ул. Северная, 324, кв. 15" />
            </label>
          )}
          {quote?.shippingError && <div className="form-error">{quote.shippingError}</div>}
          {quote?.shipping && (
            <div className="ship-quote">
              <span>{quote.shipping.free ? "Бесплатно" : rub(quote.shipping.cost)}</span>
              <span className="muted small">
                {quote.shipping.days ? `${quote.shipping.days} дн. после отправки` : quote.shipping.estimate ? "срок уточним после оформления" : ""}
              </span>
            </div>
          )}
        </fieldset>

        <fieldset className="panel stack">
          <legend className="step">
            <span>3</span> Скидки
          </legend>
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1 }}>
              Промокод
              <input
                className="input"
                value={promo ?? promoInput}
                disabled={!!promo}
                onChange={(e) => {
                  setPromoInput(e.target.value.toUpperCase());
                  setPromoMsg(null);
                }}
                placeholder="ABRAMOV10"
              />
            </label>
            {promo ? (
              <button type="button" className="btn btn--line btn--sm" style={{ minHeight: 48 }} onClick={() => setPromo(null)}>
                Убрать
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--line btn--sm"
                style={{ minHeight: 48 }}
                disabled={!promoInput.trim()}
                onClick={() => setPromo(promoInput.trim())}
              >
                Применить
              </button>
            )}
          </div>
          {promoMsg && <div className="small" style={{ color: "var(--c-danger)" }}>{promoMsg}</div>}
          {promo && quote?.promo && <div className="small" style={{ color: "var(--c-success)" }}>Промокод {quote.promo.code}: {quote.promo.label}</div>}

          <label className={`check ${!quote?.bonus.available ? "check--off" : ""}`}>
            <input type="checkbox" checked={useBonus} disabled={!quote?.bonus.available} onChange={(e) => setUseBonus(e.target.checked)} />
            <span>
              Списать бонусы: <b className="gold">{num(quote?.bonus.available ?? 0)}</b> из {num(user.bonus)}
              <br />
              <span className="muted">
                {quote?.bonus.blockedByPromo
                  ? "С этим промокодом бонусы списать нельзя"
                  : user.bonus === 0
                    ? "Бонусы начисляются после получения заказа"
                    : "Бонусами можно оплатить часть заказа — лимит в правилах программы"}
              </span>
            </span>
          </label>

          {canReferral && (
            <label className="field">
              Код друга, если вас пригласили
              <input className="input" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} placeholder="AS-XXXXXX" maxLength={9} />
            </label>
          )}
          <label className="field">
            Комментарий к заказу
            <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} style={{ minHeight: 80, paddingTop: 12 }} />
          </label>
        </fieldset>
      </div>

      <aside className="summary summary--sticky" aria-busy={loading}>
        <div className="label">Ваш заказ</div>
        <ul className="summary__items">
          {quote?.lines.map((l) => (
            <li key={l.variantId}>
              {l.image ? <img src={l.image} alt="" /> : <span />}
              <span>
                {l.name}
                {l.variantName ? `, ${l.variantName}` : ""}
                <span className="muted"> × {l.qty}</span>
              </span>
              <span>{rub(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="summary__row">
          <span>Товары</span>
          <span>{quote ? rub(quote.subtotal) : "…"}</span>
        </div>
        {!!quote?.discount && (
          <div className="summary__row good">
            <span>Промокод {quote.promo?.code}</span>
            <span>−{rub(quote.discount)}</span>
          </div>
        )}
        {!!quote?.bonus.spent && (
          <div className="summary__row good">
            <span>Бонусы</span>
            <span>−{rub(quote.bonus.spent)}</span>
          </div>
        )}
        <div className="summary__row">
          <span>Доставка</span>
          <span>{quote?.shipping ? (quote.shipping.free ? "бесплатно" : rub(quote.shipping.cost)) : <span className="muted">выберите адрес</span>}</span>
        </div>
        <div className="summary__total">
          <span>К оплате</span>
          <span>{quote ? rub(quote.total) : "…"}</span>
        </div>
        {!!quote?.accrue && (
          <div className="summary__bonus">
            +{num(quote.accrue / 100)} бонусов после получения · {quote.tierPercent}%
          </div>
        )}
        {(error || quoteError) && (
          <div className="form-error" ref={errRef} role="alert">
            {error ?? quoteError}
          </div>
        )}
        <button className="btn btn--gold btn--block" disabled={!ready || submitting || !canPay}>
          {submitting ? "Создаём заказ…" : testMode ? "Создать заказ (тест)" : `Оплатить ${quote ? rub(quote.total) : ""}`}
        </button>
        <p className="muted small" style={{ margin: 0 }}>
          {!deliveryInput
            ? "Укажите город доставки"
            : needPoint
              ? "Выберите пункт выдачи"
              : needAddress
                ? "Укажите адрес для курьера"
                : "Оплата картой, через СБП или SberPay на защищённой странице ЮKassa."}
        </p>
        <p className="muted small" style={{ margin: 0, fontSize: 12 }}>
          Нажимая кнопку, вы подтверждаете заказ
          {docs.offer && (
            <>
              {" "}
              и принимаете <Link href="/p/offer">условия оферты</Link>
            </>
          )}
          {docs.returns && (
            <>
              , <Link href="/p/returns">правила возврата</Link>
            </>
          )}
          . Данные обрабатываются по <Link href="/p/privacy">политике конфиденциальности</Link>.
        </p>
      </aside>
    </form>
  );
}
