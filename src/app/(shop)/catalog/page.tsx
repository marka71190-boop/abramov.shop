import type { Metadata } from "next";
import { CatalogView, parseCatalogParams, type RawSearch } from "@/components/catalog/CatalogView";
import { getViewer } from "@/lib/viewer";

type Props = { searchParams: Promise<RawSearch> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const filtered = Object.keys(sp).length > 0;
  return {
    title: q ? `Поиск: ${q.slice(0, 60)}` : "Каталог",
    description: "Всё для бильярда: кии, мел, перчатки, аксессуары. Доставка СДЭК по всей России, бонусы с каждой покупки.",
    alternates: { canonical: "/catalog" },
    // Страницы поиска и фильтров не нужны в выдаче — индексируется только сам каталог
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CatalogPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = parseCatalogParams(raw);
  const viewer = await getViewer();

  return (
    <section className="container section" style={{ paddingTop: "clamp(40px, 6vw, 80px)" }}>
      <div className="section-head" style={{ marginBottom: 24 }}>
        <h1 className="h2">{params.q ? `Поиск: «${params.q}»` : "Каталог"}</h1>
      </div>
      <CatalogView basePath="/catalog" params={params} raw={raw} viewer={viewer} isAll />
    </section>
  );
}
