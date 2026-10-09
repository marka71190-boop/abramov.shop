import { Fragment } from "react";

/**
 * Простая разметка текстов страниц из админки (без HTML — безопасно):
 *   «## » — подзаголовок, «- » — пункт списка, пустая строка — новый абзац,
 *   ссылки вида https://… становятся кликабельными.
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="rich">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (!lines.length) return null;
        const out: React.ReactNode[] = [];
        let list: string[] = [];
        let para: string[] = [];
        const flushList = () => {
          if (list.length) out.push(<ul key={`u${out.length}`}>{list.map((l, j) => <li key={j}>{linkify(l)}</li>)}</ul>);
          list = [];
        };
        const flushPara = () => {
          if (para.length) out.push(<p key={`p${out.length}`}>{linkify(para.join(" "))}</p>);
          para = [];
        };
        for (const line of lines) {
          if (line.startsWith("## ")) {
            flushList();
            flushPara();
            out.push(<h2 key={`h${out.length}`}>{line.slice(3)}</h2>);
          } else if (/^[-•] /.test(line)) {
            flushPara();
            list.push(line.slice(2));
          } else {
            flushList();
            para.push(line);
          }
        }
        flushList();
        flushPara();
        return <Fragment key={i}>{out}</Fragment>;
      })}
    </div>
  );
}

function linkify(s: string) {
  const parts = s.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p}>
        {p}
      </a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/**
 * В заголовках капсом «β» превращается в заглавную «Β», которой нет в шрифте.
 * Оставляем β строчной, остальное — капсом.
 */
export function KeepBeta({ text }: { text: string }) {
  const parts = text.split("β");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <span style={{ textTransform: "none" }}>β</span>}
        </Fragment>
      ))}
    </>
  );
}
