import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="maintenance">
      <div>
        <Logo id="nf" title="Abramov" />
        <h1 className="h2">Страница не найдена</h1>
        <p className="muted" style={{ margin: "16px 0 24px" }}>
          Возможно, она ещё не опубликована или ссылка устарела.
        </p>
        <Link className="btn btn--gold" href="/">
          На главную
        </Link>
      </div>
    </main>
  );
}
