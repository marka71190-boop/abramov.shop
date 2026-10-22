import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { attrValues, listAttributes } from "@/lib/attributes";
import { getCueConfig, CUE_SLUG } from "@/lib/cue";
import type { QuizProduct } from "@/lib/quiz";
import { ratingsFor } from "@/lib/reviews";
import { og } from "@/lib/seo";
import { isPublic, publicWhere } from "@/lib/visibility";
import { CueQuiz } from "./CueQuiz";

const DESC = "Ответьте на 5 вопросов — подскажем длину, вес и наклейку кия для русского бильярда и покажем подходящие кии из каталога.";

export const metadata: Metadata = {
  title: "Подбор кия за минуту",
  description: DESC,
  alternates: { canonical: "/podbor-kiya" },
  openGraph: og({ url: "/podbor-kiya", title: "Подбор кия за минуту — Abramov Shop", description: DESC }),
};

/** Кии из каталога: товары с весом в характеристиках или из категории «Кии» */
async function quizProducts(): Promise<QuizProduct[]> {
  const attrs = await listAttributes();
  const key = (k: string) => attrs.find((a) => a.key === k)?.id;
  const [wId, lId, tId, cId] = [key("weight"), key("length"), key("tip"), key("construction")];
  const rows = await db.query.product.findMany({
    where: and(publicWhere(s.product), ne(s.product.slug, CUE_SLUG)),
    with: { category: true, variants: { where: eq(s.productVariant.isActive, true) }, images: { orderBy: asc(s.productImage.sortOrder), limit: 1 } },
    limit: 500,
  });
  const vals = await attrValues(rows.map((r) => r.id));
  const cueCat = (name: string | undefined, slug: string | undefined) => /^ки[йи]/i.test(name ?? "") || /^(kii|kiy|cue)/i.test(slug ?? "");
  const list = rows.filter((r) => {
    if (r.category && !isPublic(r.category)) return false;
    if (!r.variants.some((v) => v.stock > 0)) return false;
    return (wId && vals.get(r.id)?.has(wId)) || cueCat(r.category?.name, r.category?.slug);
  });
  const ratings = await ratingsFor(list.map((r) => r.id));
  const n = (pid: string, aid: string | undefined) => {
    const v = aid ? vals.get(pid)?.get(aid) : undefined;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  return list.map((r) => {
    const inStock = r.variants.filter((v) => v.stock > 0);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      image: r.images[0]?.url ?? null,
      price: Math.min(...inStock.map((v) => v.price ?? r.price)),
      weight: n(r.id, wId),
      length: n(r.id, lId),
      tip: n(r.id, tId),
      construction: (cId && vals.get(r.id)?.get(cId)) || null,
      rating: ratings.get(r.id)?.avg ?? null,
    };
  });
}

export default async function QuizPage() {
  const [products, cfg] = await Promise.all([quizProducts(), getCueConfig()]);
  return (
    <section className="container section" style={{ paddingTop: "clamp(32px, 5vw, 64px)" }}>
      <div className="quiz-head">
        <div className="label gold">5 вопросов · 1 минута</div>
        <h1 className="h2">Подбор кия</h1>
        <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
          Подскажем длину, вес и наклейку под ваш рост и манеру игры — и покажем подходящие кии для русского бильярда.
        </p>
      </div>
      <CueQuiz products={products} cue={cfg.enabled ? cfg : null} />
    </section>
  );
}
