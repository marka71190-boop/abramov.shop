/**
 * Текст статьи журнала. Разметка простая и безопасная (без HTML):
 *   ## Заголовок, ### Подзаголовок
 *   - пункт списка, 1. нумерованный пункт
 *   > Совет — выделенный блок
 *   **жирный**, [текст ссылки](https://… или /catalog)
 *   ![подпись](адрес фото) — отдельной строкой
 *   ссылка на видео VK / Rutube / YouTube — отдельной строкой
 *   [[product:адрес-товара]] — карточка товара
 */
import Link from "next/link";
import { Fragment } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { parseVideo } from "@/lib/video";
import { InlineVideo } from "./InlineVideo";

type Card = Parameters<typeof ProductCard>[0]["p"];

const safeUrl = (u: string) => /^(\/[^/]|https:\/\/)/.test(u);

/** **жирный**, [текст](адрес) и голые https-ссылки */
function inline(s: string, key = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(<Fragment key={`${key}t${n++}`}>{s.slice(last, m.index)}</Fragment>);
    if (m[1]) out.push(<strong key={`${key}b${n++}`}>{inline(m[1], `${key}${n}`)}</strong>);
    else if (m[2] && safeUrl(m[3])) {
      out.push(
        m[3].startsWith("/") ? (
          <Link key={`${key}l${n++}`} href={m[3]}>
            {m[2]}
          </Link>
        ) : (
          <a key={`${key}l${n++}`} href={m[3]} target="_blank" rel="noreferrer">
            {m[2]}
          </a>
        ),
      );
    } else if (m[2]) out.push(<Fragment key={`${key}x${n++}`}>{m[2]}</Fragment>);
    else if (m[4])
      out.push(
        <a key={`${key}u${n++}`} href={m[4]} target="_blank" rel="noreferrer">
          {m[4].replace(/^https:\/\//, "")}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < s.length) out.push(<Fragment key={`${key}e`}>{s.slice(last)}</Fragment>);
  return out;
}

export function ArticleBody({ body, products, title, poster }: { body: string; products: Map<string, Card>; title: string; poster: string | null }) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let quote: string[] = [];
  let cards: Card[] = [];
  const k = () => `b${out.length}`;
  const flush = () => {
    if (para.length) out.push(<p key={k()}>{inline(para.join(" "), k())}</p>);
    if (ul.length) out.push(<ul key={k()}>{ul.map((l, i) => <li key={i}>{inline(l, `${k()}${i}`)}</li>)}</ul>);
    if (ol.length) out.push(<ol key={k()}>{ol.map((l, i) => <li key={i}>{inline(l, `${k()}${i}`)}</li>)}</ol>);
    if (quote.length) out.push(<aside key={k()} className="article__tip">{inline(quote.join(" "), k())}</aside>);
    if (cards.length)
      out.push(
        <div key={k()} className="article__products products">
          {cards.map((c) => (
            <ProductCard key={c.id} p={c} favorite={false} />
          ))}
        </div>,
      );
    para = [];
    ul = [];
    ol = [];
    quote = [];
    cards = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const prod = /^\[\[product:([a-z0-9-]+)\]\]$/.exec(line);
    if (prod) {
      if (para.length || ul.length || ol.length || quote.length) {
        const keep = cards;
        cards = [];
        flush();
        cards = keep;
      }
      const c = products.get(prod[1]);
      if (c) cards.push(c);
      continue;
    }
    if (cards.length) flush();
    if (line.startsWith("### ")) {
      flush();
      out.push(<h3 key={k()}>{inline(line.slice(4), k())}</h3>);
    } else if (line.startsWith("## ")) {
      flush();
      out.push(<h2 key={k()}>{inline(line.slice(3), k())}</h2>);
    } else if (/^!\[[^\]]*\]\(([^)\s]+)\)$/.test(line)) {
      flush();
      const [, alt, src] = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line)!;
      if (safeUrl(src))
        out.push(
          <figure key={k()} className="article__figure">
            <img src={src} alt={alt} loading="lazy" />
            {alt && <figcaption>{alt}</figcaption>}
          </figure>,
        );
    } else if (/^https:\/\/\S+$/.test(line) && parseVideo(line)) {
      flush();
      out.push(<InlineVideo key={k()} url={line} title={title} poster={poster} />);
    } else if (/^[-•] /.test(line)) {
      if (para.length || ol.length || quote.length) flush();
      ul.push(line.slice(2));
    } else if (/^\d+[.)] /.test(line)) {
      if (para.length || ul.length || quote.length) flush();
      ol.push(line.replace(/^\d+[.)] /, ""));
    } else if (line.startsWith("> ")) {
      if (para.length || ul.length || ol.length) flush();
      quote.push(line.slice(2));
    } else {
      if (ul.length || ol.length || quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="rich article__body">{out}</div>;
}
