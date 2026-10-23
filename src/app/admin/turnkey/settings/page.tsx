import Link from "next/link";
import { getTurnkey } from "@/lib/turnkey";
import { requireAdmin } from "@/lib/viewer";
import { TurnkeySettingsForm } from "./TurnkeySettingsForm";

export default async function TurnkeySettings() {
  await requireAdmin("OWNER");
  const cfg = await getTurnkey();
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/turnkey">← Клуб под ключ</Link>
      </p>
      <h1>Столы, цены и нормы</h1>
      <p className="muted" style={{ margin: 0 }}>
        Модели столов и цены видит покупатель в конструкторе «Клуб под ключ». Цена 0 — «по запросу». Размеры — габарит стола по внешнему краю бортов, по
        ним сайт расставляет столы.
      </p>
      <TurnkeySettingsForm initial={cfg} />
    </>
  );
}
