import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { og } from "@/lib/seo";
import { isPlaceholderEmail } from "@/lib/site";
import { getTurnkey } from "@/lib/turnkey";
import { getViewer, isAdmin } from "@/lib/viewer";
import { TurnkeyApp } from "./TurnkeyApp";

const DESC = "Бильярдный клуб под ключ: нарисуйте зал — сайт расставит столы русского бильярда, пула и снукера по нормам, покажет 3D и посчитает смету.";

export const metadata: Metadata = {
  title: "Бильярдный клуб под ключ",
  description: DESC,
  alternates: { canonical: "/klub-pod-klyuch" },
  openGraph: og({ url: "/klub-pod-klyuch", title: "Бильярдный клуб под ключ — Abramov Shop", description: DESC }),
};

export default async function TurnkeyPage() {
  const [cfg, me] = await Promise.all([getTurnkey(), getViewer()]);
  if (!cfg.enabled && !isAdmin(me)) notFound();
  return (
    <section className="container section" style={{ paddingTop: "clamp(32px, 5vw, 64px)" }}>
      <div className="quiz-head">
        <div className="label gold">Для тех, кто открывает клуб</div>
        <h1 className="h2">Бильярдный клуб под ключ</h1>
        {cfg.intro && (
          <p className="muted" style={{ maxWidth: 760, margin: 0 }}>
            {cfg.intro}
          </p>
        )}
      </div>
      <TurnkeyApp cfg={cfg} user={me ? { name: me.name, phone: me.phone ?? "", email: isPlaceholderEmail(me.email) ? "" : me.email } : null} />
    </section>
  );
}
