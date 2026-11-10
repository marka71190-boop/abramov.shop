"use client";
/**
 * Цены в валюте покупателя из-за рубежа: все суммы «1 250 ₽» на страницах магазина
 * показываются в валюте его страны (тенге, белорусские рубли, доллары…) по курсу ЦБ — только для удобства:
 * сайт считает в рублях, а платят из-за рубежа в долларах. Переключатель — в шапке (CurrencySwitch).
 *
 * Как устроено: после загрузки страницы проходим по тексту и заменяем суммы в рублях;
 * MutationObserver ловит новые и изменённые цены (корзина, фильтры, переходы по страницам).
 * Скрипты, поля ввода и всё с data-rub (там, где нужны именно рубли) не трогаем.
 */
import { useEffect, useState } from "react";
import { currencyWord, isWhole, signOf } from "@/lib/currency";
import { getCurrency, initCurrency, onCurrency, type ShowCurrency } from "./store";

export interface FxRates {
  rates: Record<string, number>; // рублей за 1 единицу
  buffer: number;
}

const PRICE = /(−|-)?(\d{1,3}(?:[   ]\d{3})*(?:,\d{1,2})?)[   ]?₽/g;
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "NOSCRIPT", "CODE"]);

function convert(text: string, cur: string, r: FxRates) {
  const rate = r.rates[cur];
  if (!rate) return text;
  return text.replace(PRICE, (_, minus: string | undefined, num: string) => {
    const rub = Number(num.replace(/[   ]/g, "").replace(",", "."));
    if (!Number.isFinite(rub)) return _;
    let v = (rub * (1 + r.buffer / 100)) / rate;
    // Тенге, драмы, сомы — целыми; доллары, евро — до центов, вверх
    const whole = isWhole(cur);
    v = whole ? Math.ceil(v) : Math.ceil(v * 100) / 100;
    const s = v.toLocaleString("ru-RU", { minimumFractionDigits: whole || Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
    return `${minus ?? ""}${s}\u00a0${signOf(cur)}`;
  });
}

export function CurrencyLayer({ rates, initial }: { rates: FxRates | null; initial: ShowCurrency }) {
  const [cur, setCur] = useState<ShowCurrency>(() => {
    initCurrency(initial, rates?.rates ?? null);
    return getCurrency();
  });

  useEffect(() => onCurrency(setCur), []);

  useEffect(() => {
    if (!rates) return;
    const original = new WeakMap<Text, string>(); // что было в рублях
    const shown = new WeakMap<Text, string>(); // что мы показали

    const skip = (t: Text) => {
      for (let el = t.parentElement; el; el = el.parentElement) {
        if (SKIP.has(el.tagName) || el.hasAttribute("data-rub") || el.isContentEditable) return true;
        if (el === document.body) break;
      }
      return false;
    };
    const apply = (t: Text) => {
      const v = t.nodeValue ?? "";
      if (shown.get(t) === v) return; // это наша замена
      if (!v.includes("₽")) {
        if (cur === "RUB" && original.has(t) && shown.get(t) === v) t.nodeValue = original.get(t)!;
        return;
      }
      if (skip(t)) return;
      original.set(t, v);
      if (cur === "RUB") return;
      const next = convert(v, cur, rates);
      if (next !== v) {
        shown.set(t, next);
        t.nodeValue = next;
      }
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return apply(root as Text);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) apply(n as Text);
    };
    // Вернуть рубли (переключили на ₽)
    const restore = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n as Text;
        if (original.has(t) && shown.get(t) === t.nodeValue) t.nodeValue = original.get(t)!;
      }
    };

    if (cur === "RUB") {
      restore();
      return;
    }
    walk(document.body);
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") apply(m.target as Text);
        else m.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => {
      mo.disconnect();
      restore();
    };
  }, [cur, rates]);

  if (!rates || cur === "RUB") return null;
  return (
    <div className="cur-note" role="note" data-rub>
      Цены {currencyWord(cur)} по курсу ЦБ — для удобства, примерно. {cur === "USD" ? "Оплата картой — в долларах." : "Оплата картой — в долларах, по курсу ЦБ."}
    </div>
  );
}
