import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RichText } from "@/components/RichText";
import { getActiveConsent, getCurrentDocument, recordConsent } from "@/lib/consent";
import { getRequestMeta } from "@/lib/request";
import { requireUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Согласие на обработку данных", robots: { index: false } };

/**
 * Страница для аккаунтов без действующего согласия (например, если согласие отозвали
 * или вышла новая редакция). Без отметки личный кабинет не открывается.
 */
export default async function ConsentGatePage() {
  const user = await requireUser("/consent");
  if (await getActiveConsent(user.id, "PERSONAL_DATA")) redirect("/account");
  const doc = await getCurrentDocument("PERSONAL_DATA");

  async function agree(formData: FormData) {
    "use server";
    const u = await requireUser("/consent");
    if (formData.get("pd") !== "on") return;
    const meta = await getRequestMeta();
    await recordConsent({ kind: "PERSONAL_DATA", source: "RECONSENT", userId: u.id, name: u.name, email: u.email, phone: u.phone, ...meta });
    redirect("/account");
  }

  return (
    <section className="container doc">
      <h1>Подтвердите согласие</h1>
      <p className="muted">Чтобы пользоваться личным кабинетом, бонусами и оформлять заказы, нужно согласие на обработку персональных данных.</p>
      <div className="panel" style={{ maxHeight: 360, overflowY: "auto", margin: "24px 0" }}>
        <RichText text={doc.body} />
      </div>
      <form action={agree} className="stack" style={{ maxWidth: 520 }}>
        <label className="check">
          <input type="checkbox" name="pd" required />
          <span>
            Даю согласие на обработку персональных данных <span className="req">*</span>
          </span>
        </label>
        <button className="btn btn--gold" type="submit">
          Продолжить
        </button>
      </form>
    </section>
  );
}
