"use client";
/**
 * Сканер штрихкодов, подключённый как клавиатура (USB к компьютеру, Bluetooth HID к телефону):
 * он «печатает» код очень быстро и жмёт Enter. Ловим такой ввод на всей странице — касса, ревизия
 * и приёмка добавляют товар, даже если курсор нигде не стоит. Человек так быстро не печатает:
 * между символами сканера — единицы миллисекунд, у человека — сотни.
 * Если курсор был в поле ввода, отсканированные символы из него убираем.
 */
import { useEffect, useRef } from "react";

const MAX_GAP = 60; // мс между символами сканера
const MIN_LEN = 4;

// Сканер «нажимает клавиши»: при русской раскладке буквы приходят кириллицей (AS → ФЫ). Возвращаем латиницу по местам клавиш
const RU = "йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ";
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
const fromRu = (s: string) => (/[А-Яа-яЁё]/.test(s) && !/[A-Za-z]/.test(s) ? s.replace(/[А-Яа-я]/g, (c) => EN[RU.indexOf(c)] ?? c) : s);

function strip(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  if (!el.value.endsWith(text)) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  // Нативный сеттер + событие input — чтобы React увидел новое значение
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, -text.length));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** onCode вернул false — «не моё»: ввод уходит дальше (например, номер заказа — панели выдачи) */
export function useScanWedge(onCode: (code: string) => void | boolean, enabled = true) {
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    let slow = false;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last > MAX_GAP) {
        buf = "";
        slow = false;
      }
      last = now;
      if (e.key === "Enter") {
        const typed = buf.trim();
        buf = "";
        if (typed.length >= MIN_LEN && !slow) {
          if (cb.current(fromRu(typed)) === false) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          const t = e.target;
          if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) strip(t, typed);
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buf += e.key;
      else if (e.key !== "Shift") slow = true; // стрелки, Backspace — это человек
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
