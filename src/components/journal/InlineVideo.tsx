"use client";
import { useState } from "react";
import { parseVideo, PROVIDER_NAME } from "@/lib/video";

/** Видео в статье: плеер грузится только по клику */
export function InlineVideo({ url, title, poster }: { url: string; title: string; poster: string | null }) {
  const [on, setOn] = useState(false);
  const e = parseVideo(url);
  if (!e) return null;
  return (
    <figure className="video article__video">
      <div className="video__frame">
        {on ? (
          <iframe src={e.src} title={title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <button type="button" className="video__facade" onClick={() => setOn(true)} aria-label={`Смотреть видео: ${title}`}>
            {poster && <img src={poster} alt="" loading="lazy" />}
            <span className="video__play" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            </span>
            <span className="video__src">{PROVIDER_NAME[e.provider]}</span>
          </button>
        )}
      </div>
    </figure>
  );
}
