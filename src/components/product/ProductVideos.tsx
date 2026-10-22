"use client";

import { useState } from "react";
import { parseVideo, PROVIDER_NAME } from "@/lib/video";

/**
 * Видеообзоры в карточке товара. Плеер грузится только по клику:
 * страница не тянет сторонние скрипты и cookies, пока покупатель сам не включил видео.
 */
export function ProductVideos({ videos, poster, productName }: { videos: { url: string; title: string }[]; poster: string | null; productName: string }) {
  const items = videos.map((v) => ({ ...v, e: parseVideo(v.url) })).filter((v) => v.e);
  const [playing, setPlaying] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <div className="videos" id="video">
      <div className="section-head" style={{ marginBottom: 20 }}>
        <h2 className="h3">{items.length > 1 ? "Видеообзоры" : "Видеообзор"}</h2>
      </div>
      <div className={`videos__grid${items.length === 1 ? " videos__grid--one" : ""}`}>
        {items.map((v, i) => (
          <figure key={v.url} className="video">
            <div className="video__frame">
              {playing === i ? (
                <iframe
                  src={v.e!.src}
                  title={v.title || `${productName} — видео`}
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button type="button" className="video__facade" onClick={() => setPlaying(i)} aria-label={`Смотреть: ${v.title || productName}`}>
                  {/* Обложка — своё фото товара: до клика к видеосервису не уходит ни одного запроса */}
                  {poster && <img src={poster} alt="" loading="lazy" />}
                  <span className="video__play" aria-hidden>
                    <svg viewBox="0 0 24 24" width="28" height="28">
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="video__src">{PROVIDER_NAME[v.e!.provider]}</span>
                </button>
              )}
            </div>
            {v.title && <figcaption>{v.title}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  );
}
