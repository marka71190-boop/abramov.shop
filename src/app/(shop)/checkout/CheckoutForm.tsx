"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { forgetPromo, storedPromo, useCart } from "@/components/cart/CartProvider";
import { useQuote } from "@/components/cart/useQuote";
import { num, rub } from "@/lib/format";
import { goal } from "@/lib/track";
import { placeOrderAction } from "./actions";

import type { AddressCard } from "@/components/delivery/AddressBook";
import { CityPicker, PointPicker, type City, type Point } from "@/components/delivery/Pickers";
import { prettyPhone } from "@/lib/format";

interface Props {
  user: { name: string; phone: string; email: string; bonus: number };
  canReferral: boolean;
  delivery: { pvz: boolean; courier: boolean; cdek: boolean };
  maxPerItem: number;
  canPay: boolean;
  testMode: boolean;
  docs: { offer: boolean; returns: boolean };
  addresses: AddressCard[];
  maxAddresses: number;
  /** Клубы для самовывоза */
  clubs: { id: string; name: string; city: string; address: string; workTime: string; note: string; mapUrl: string }[];
  pickupDays: number;
}

type DeliveryType = "PVZ" | "COURIER" | "PICKUP";

/** Значения полей заказа из сохранённой карточки адреса */
function fromCard(a: AddressCard, cdek: boolean) {
  return {
    type: (a.deliveryType === "COURIER" ? "COURIER" : "PVZ") as "PVZ" | "COURIER",
    city: a.cdekCityCode ? { code: a.cdekCityCode, name: a.city } : null,
    cityText: cdek ? "" : a.city,
    point: a.deliveryType === "PVZ" && a.cdekPvzCode ? { code: a.cdekPvzCode, name: "", address: a.address, workTime: "", postalCode: a.postalCode } : null,
    pvzText: a.deliveryType === "PVZ" && !a.cdekPvzCode ? a.address : "",
    address: a.deliveryType === "COURIER" ? a.address : "",
    name: a.recipientName ?? "",
    phone: prettyPhone(a.recipientPhone) || "",
    comment: a.note ?? "",
  };
}


export function CheckoutForm({ user, canReferral, delivery, canPay, testMode, docs, addresses, maxAddresses, clubs, pickupDays }: Props) {
  const cart = useCart();
  // Сохранённый адрес: основной (или последний использованный) подставляется сразу
  const first = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const init = first ? fromCard(first, delivery.cdek) : null;
  const [picked, setPicked] = useState<string>(first?.id ?? "new");
  const [saveNew, setSaveNew] = useState(addresses.length < maxAddresses);
  const [saveLabel, setSaveLabel] = useState(addresses.length ? "" : "Дом");
  const [name, setName] = useState(init?.name || user.name);
  const [phone, setPhone] = useState(init?.phone || user.phone);
  const [email, setEmail] = useState(user.email);
  const [comment, setComment] = useState(init?.comment ?? "");
  const [type, setType] = useState<DeliveryType>(init?.type ?? (delivery.pvz ? "PVZ" : delivery.courier ? "COURIER" : clubs.length ? "PICKUP" : "PVZ"));
  const [clubId, setClubId] = useState<string | null>(clubs.length === 1 ? clubs[0].id : null);
  const [city, setCity] = useState<City | null>(init?.city ?? null);
  const [cityText, setCityText] = useState(init?.cityText ?? ""); // если СДЭК ещё не подключён
  const [point, setPoint] = useState<Point | null>(init?.point ?? null);
  const [pvzText, setPvzText] = useState(init?.pvzText ?? "");
  const [address, setAddress] = useState(init?.address ?? "");

  function pick(id: string) {
    setPicked(id);
    const a = addresses.find((x) => x.id === id);
    const v = a
      ? fromCard(a, delivery.cdek)
      : { type: (delivery.pvz ? "PVZ" : "COURIER") as "PVZ" | "COURIER", city: null, cityText: "", point: null, pvzText: "", address: "", name: user.name, phone: user.phone, comment: "" };
    setType(v.type);
    setCity(v.city);
    setCityText(v.cityText);
    setPoint(v.point);
    setPvzText(v.pvzText);
    setAddress(v.address);
    setName(v.name || user.name);
    setPhone(v.phone || user.phone);
    setComment(v.comment);
  }
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState<string | null>(null);
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  const [useBonus, setUseBonus] = useState(false);
  const [referral, setReferral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => goal("begin_checkout"), []);

  useEffect(() => {
    try {
      const fromMail = storedPromo();
      if (fromMail) {
        setPromo(fromMail);
        setPromoInput(fromMail);
      }
      const r = localStorage.getItem("as_ref");
      if (r && canReferral) setReferral(r);
    } catch {}
  }, [canReferral]);

  const deliveryInput = type === "PICKUP"
    ? clubId
      ? { type, clubId }
      : null
    : delivery.cdek
    ? city
      ? { type, cityCode: city.code, cityName: city.name.split(",")[0], pvzCode: point?.code, pvzAddress: point?.address, address, postalCode: point?.postalCode }
      : null
    : cityText.trim()
      ? { type, cityName: cityText.trim(), pvzAddress: pvzText.trim() || null, address }
      : null;

  const { quote, error: quoteError, loading, setQuote } = useQuote(
    { promoCode: promo, giftCode: gift, useBonus, delivery: deliveryInput ? { ...deliveryInput, address: undefined, pvzAddress: undefined } : null },
    [promo, gift, useBonus, type, city?.code, clubId, delivery.cdek ? "" : cityText.trim()],
  );

  useEffect(() => {
    if (!quote || !gift) return;
    if (quote.giftError) {
      setGiftMsg(quote.giftError);
      setGift(null);
    } else setGiftMsg(null);
  }, [quote, gift]);

  useEffect(() => {
    if (!quote || !promo) return;
    if (quote.promoError) {
      setPromoMsg(quote.promoError);
      setPromo(null);
      // «Войдите, чтобы применить» — промокод из письма сохраняем до входа
      if (!quote.promoError.startsWith("Войдите")) forgetPromo();
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
  const pickupClub = type === "PICKUP" ? (clubs.find((c) => c.id === clubId) ?? null) : null;
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
      giftCode: gift,
      useBonus,
      delivery: deliveryInput,
      name,
      phone,
      email,
      comment,
      referralCode: referral || null,
      savedAddressId: picked !== "new" ? picked : null,
      saveAddress: picked === "new" && saveNew && addresses.length < maxAddresses ? { label: saveLabel.trim() || "Адрес" } : null,
      expectedTotal: quote.payable,
    }).catch(() => ({ error: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз" }) as const);
    if ("payUrl" in r && r.payUrl) {
      goal("order_created", { order_price: quote.total / 100 });
      try {
        localStorage.removeItem("as_ref");
        forgetPromo();
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
        {addresses.length > 0 && (
          <fieldset className="panel stack">
            <legend className="step">
              <span>★</span> Куда доставить
            </legend>
            <div className="addr-grid" role="radiogroup" aria-label="Сохранённые адреса">
              {addresses.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={picked === a.id} className="addr-card" onClick={() => pick(a.id)}>
                  <span className="addr-card__head">
                    <strong>{a.label}</strong>
                    {a.isDefault && <span className="muted small">основной</span>}
                  </span>
                  <span className="small">
                    {a.deliveryType === "PVZ" ? "Пункт СДЭК" : "Курьер"} · {a.city}
                  </span>
                  <span className="small muted">{a.address}</span>
                  <span className="small muted">{a.recipientName}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={picked === "new"} className="addr-card" onClick={() => pick("new")}>
                <strong>+ Новый адрес</strong>
                <span className="small muted">заполнить вручную</span>
              </button>
            </div>
            <Link href="/account#addresses" className="small">
              Управлять адресами
            </Link>
          </fieldset>
        )}

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
            <span>2</span> Доставка
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
            {clubs.length > 0 && (
              <button type="button" role="radio" aria-checked={type === "PICKUP"} onClick={() => setType("PICKUP")}>
                <strong>Самовывоз из клуба</strong>
                <span>бесплатно · {[...new Set(clubs.map((c) => c.city))].join(", ")}</span>
              </button>
            )}
          </div>

          {type === "PICKUP" ? (
            <div className="stack" style={{ gap: 10 }}>
              <div className="club-list" role="radiogroup" aria-label="Клуб для самовывоза">
                {clubs.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={clubId === c.id} className="addr-card" onClick={() => setClubId(c.id)}>
                    <span className="label">{c.city}</span>
                    <strong>{c.name}</strong>
                    <span className="small">{c.address}</span>
                    {c.workTime && <span className="muted small">{c.workTime}</span>}
                  </button>
                ))}
              </div>
              {pickupClub && (
                <div className="notice notice--muted" style={{ margin: 0 }}>
                  {pickupClub.note && <>{pickupClub.note}. </>}Заказ будет ждать вас {pickupDays} дн. — пришлём письмо, когда можно забирать.{" "}
                  <a href={pickupClub.mapUrl} target="_blank" rel="noreferrer">
                    Как добраться
                  </a>
                </div>
              )}
            </div>
          ) : delivery.cdek ? (
            <CityPicker
              key={picked}
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
          {type === "PICKUP" && !clubId && <div className="muted small">Выберите клуб, где удобно забрать заказ</div>}
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
          {type !== "PICKUP" && picked === "new" && addresses.length < maxAddresses && (
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="check" style={{ minHeight: 48 }}>
                <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} />
                <span>Сохранить в мои адреса</span>
              </label>
              {saveNew && (
                <label className="field" style={{ flex: "1 1 180px" }}>
                  Название
                  <input className="input" value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} maxLength={30} placeholder="Дом, работа…" />
                </label>
              )}
            </div>
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
            <span>3</span> Скидки и сертификат
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

          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1 }}>
              Подарочный сертификат
              <input
                className="input"
                value={gift ?? giftInput}
                disabled={!!gift}
                onChange={(e) => {
                  setGiftInput(e.target.value.toUpperCase());
                  setGiftMsg(null);
                }}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {gift ? (
              <button type="button" className="btn btn--line btn--sm" style={{ minHeight: 48 }} onClick={() => setGift(null)}>
                Убрать
              </button>
            ) : (
              <button type="button" className="btn btn--line btn--sm" style={{ minHeight: 48 }} disabled={!giftInput.trim()} onClick={() => setGift(giftInput.trim())}>
                Применить
              </button>
            )}
          </div>
          {giftMsg && <div className="small" style={{ color: "var(--c-danger)" }}>{giftMsg}</div>}
          {gift && quote?.gift && (
            <div className="small" style={{ color: "var(--c-success)" }}>
              Сертификат {quote.gift.code}: спишется {rub(quote.gift.applied)}, останется {rub(quote.gift.balance - quote.gift.applied)}
            </div>
          )}

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
        {!!quote?.gift?.applied && (
          <>
            <div className="summary__row">
              <span>Итого</span>
              <span>{rub(quote.total)}</span>
            </div>
            <div className="summary__row good">
              <span>Сертификат</span>
              <span>−{rub(quote.gift.applied)}</span>
            </div>
          </>
        )}
        <div className="summary__total">
          <span>К оплате</span>
          <span>{quote ? rub(quote.payable) : "…"}</span>
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
          {submitting ? "Создаём заказ…" : testMode ? "Создать заказ (тест)" : quote && quote.payable === 0 ? "Оплатить сертификатом" : `Оплатить ${quote ? rub(quote.payable) : ""}`}
        </button>
        <p className="muted small" style={{ margin: 0 }}>
          {!deliveryInput
            ? "Укажите город доставки"
            : needPoint
              ? "Выберите пункт выдачи"
              : needAddress
                ? "Укажите адрес для курьера"
                : quote?.payable === 0
                  ? "Заказ полностью оплачивается сертификатом — платить картой не нужно."
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
