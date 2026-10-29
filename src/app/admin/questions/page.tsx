import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { QuestionItem } from "./QuestionItem";

const TABS = { NEW: "Ждут ответа", PUBLISHED: "На сайте", HIDDEN: "Скрытые" } as const;
type Tab = keyof typeof TABS;

export default async function QuestionsAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireAdmin();
  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "PUBLISHED" || raw === "HIDDEN" ? raw : "NEW";
  const [list, counts] = await Promise.all([
    db.query.productQuestion.findMany({
      where: eq(s.productQuestion.status, tab),
      with: { product: { columns: { name: true, slug: true } }, user: { columns: { id: true, name: true } } },
      orderBy: tab === "NEW" ? asc(s.productQuestion.createdAt) : desc(s.productQuestion.answeredAt),
      limit: 200,
    }),
    Promise.all((Object.keys(TABS) as Tab[]).map((t) => db.$count(s.productQuestion, eq(s.productQuestion.status, t)))),
  ]);
  return (
    <>
      <h1>Вопросы о товарах</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Покупатели спрашивают в карточке товара. Вопрос появляется на сайте вместе с ответом, автору приходит письмо и уведомление.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {(Object.keys(TABS) as Tab[]).map((t, i) => (
          <Link key={t} href={`/admin/questions?tab=${t}`} className={`btn btn--sm ${t === tab ? "btn--gold" : "btn--line"}`}>
            {TABS[t]} · {counts[i]}
          </Link>
        ))}
      </div>
      {list.length ? (
        list.map((q) => (
          <section key={q.id} className="panel stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/product/${q.product.slug}#questions`} target="_blank">
                {q.product.name}
              </Link>
              <span className="small muted">
                {q.user ? <Link href={`/admin/customers/${q.user.id}`}>{q.user.name}</Link> : "Удалённый аккаунт"} · {fmtDateTime(q.createdAt)}
              </span>
            </div>
            <QuestionItem q={{ id: q.id, text: q.text, answer: q.answer, status: q.status }} canDelete={me.role === "OWNER"} />
          </section>
        ))
      ) : (
        <p className="muted">{tab === "NEW" ? "Все вопросы отвечены." : "Пусто."}</p>
      )}
    </>
  );
}
