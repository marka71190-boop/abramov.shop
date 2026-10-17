import { getHomeContent } from "@/lib/home-content";
import { requireAdmin } from "@/lib/viewer";
import { HomeForm } from "./HomeForm";

export default async function HomeAdmin() {
  await requireAdmin("OWNER");
  const values = await getHomeContent();
  return (
    <>
      <h1>Главная страница</h1>
      <p className="muted" style={{ margin: 0 }}>
        Тексты главной страницы. Если очистить поле — вернётся исходный текст. Каталог, товары, отзывы и уровни бонусов подставляются сами.
      </p>
      <HomeForm values={values} />
    </>
  );
}
