"use client";
/**
 * Пункты выдачи СДЭК на Яндекс Карте (JavaScript API 2.1). Если ключа нет или карта не загрузилась —
 * ничего не показываем: остаётся выбор списком.
 */
import { useEffect, useRef, useState } from "react";
import type { Point } from "./Pickers";

/* eslint-disable @typescript-eslint/no-explicit-any */
type YMaps = any;
declare global {
  interface Window {
    ymaps?: YMaps;
    __ymapsLoad?: Promise<YMaps>;
  }
}

function loadYmaps(key: string): Promise<YMaps> {
  if (window.__ymapsLoad) return window.__ymapsLoad;
  window.__ymapsLoad = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    s.async = true;
    s.onload = () => (window.ymaps ? window.ymaps.ready(() => resolve(window.ymaps)) : reject(new Error("ymaps")));
    s.onerror = () => {
      window.__ymapsLoad = undefined;
      reject(new Error("ymaps"));
    };
    document.head.appendChild(s);
  });
  return window.__ymapsLoad;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function PvzMap({ mapKey, points, onPick }: { mapKey: string; points: (Point & { lat: number; lon: number })[]; onPick: (p: Point) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: YMaps | null = null;
    let alive = true;
    const byCode = new Map(points.map((p) => [p.code, p]));
    loadYmaps(mapKey)
      .then((ymaps) => {
        if (!alive || !el.current) return;
        map = new ymaps.Map(el.current, { center: [points[0].lat, points[0].lon], zoom: 11, controls: ["zoomControl", "geolocationControl"] }, { suppressMapOpenBlock: false });
        map.behaviors.disable("scrollZoom"); // страница прокручивается колесом, карта — кнопками и пальцами
        const om = new ymaps.ObjectManager({ clusterize: true, gridSize: 64, clusterDisableClickZoom: false });
        om.objects.options.set({ preset: "islands#darkGreenDotIcon" });
        om.clusters.options.set({ preset: "islands#darkGreenClusterIcons" });
        om.add({
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature",
            id: p.code,
            geometry: { type: "Point", coordinates: [p.lat, p.lon] },
            properties: {
              hintContent: esc(p.address),
              balloonContentHeader: `СДЭК · ${esc(p.address)}`,
              balloonContentBody:
                `<div style="font:14px/1.45 sans-serif;max-width:260px">${p.workTime ? `${esc(p.workTime)}<br>` : ""}<span style="color:#777">${esc(p.name)}</span></div>` +
                `<button type="button" data-pvz="${esc(p.code)}" style="margin-top:10px;padding:9px 14px;border:0;background:#dcbf83;color:#0a0a0a;font-weight:700;cursor:pointer;border-radius:2px">Забрать здесь</button>`,
            },
          })),
        });
        map.geoObjects.add(om);
        if (points.length > 1) map.setBounds(om.getBounds(), { checkZoomRange: true, zoomMargin: 30 }).catch?.(() => {});
        else map.setZoom(15);
      })
      .catch(() => alive && setFailed(true));

    // Кнопка «Забрать здесь» в балуне карты
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest?.("[data-pvz]") as HTMLElement | null;
      const p = b ? byCode.get(b.dataset.pvz ?? "") : undefined;
      if (p) pick.current(p);
    };
    const node = el.current;
    node?.addEventListener("click", onClick);
    return () => {
      alive = false;
      node?.removeEventListener("click", onClick);
      map?.destroy();
    };
  }, [mapKey, points]);

  if (failed) return null;
  return <div ref={el} className="pvz-map" role="region" aria-label="Карта пунктов выдачи СДЭК" />;
}
