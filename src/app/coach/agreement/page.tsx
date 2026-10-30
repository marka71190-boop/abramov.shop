import { eq } from "drizzle-orm";
import Link from "next/link";
import { RichText } from "@/components/RichText";
import { COACH_AGREEMENT_TITLE, TAX_STATUS } from "@/content/coach-agreement";
import { db, schema as s } from "@/db";
import { lastSigned, signedAgreement } from "@/lib/coach-agreement";
import { fmtDateTime } from "@/lib/format";
import { requireCoach } from "@/lib/trainings";
import { isAdmin } from "@/lib/viewer";
import { PrintButton, SignForm } from "./SignForm";

type Props = { searchParams: Promise<{ u?: string }> };

export default async function AgreementPage({ searchParams }: Props) {
  const me = await requireCoach();
  const { u } = await searchParams;
  const admin = isAdmin(me);
  const coachId = admin && u ? u : me.id;
  const coach = await db.query.user.findFirst({ where: eq(s.user.id, coachId), columns: { id: true, name: true, patronymic: true, phone: true, email: true, role: true } });
  if (!coach) return <p className="muted">Тренер не найден.</p>;

  const signed = coachId === me.id && me.role === "COACH" ? await signedAgreement(coachId) : await lastSigned(coachId);

  if (signed) {
    return (
      <div className="stack agreement" style={{ gap: 20, maxWidth: 820 }}>
        <div className="row no-print" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link href={admin && coachId !== me.id ? "/admin/coaches" : "/coach"}>← {admin && coachId !== me.id ? "Тренеры" : "В кабинет"}</Link>
          <PrintButton />
        </div>
        <article className="panel doc agreement__doc">
          <h1 className="h3">{COACH_AGREEMENT_TITLE}</h1>
          <RichText text={signed.body} />
          <div className="agreement__sign">
            <b>Подписано простой электронной подписью</b>
            <span>
              Тренер: {signed.fullName}, {TAX_STATUS[signed.taxStatus]}
              {signed.inn ? `, ИНН ${signed.inn}` : ""}
            </span>
            <span>
              Дата и время подписания: {fmtDateTime(signed.signedAt!)} (МСК) · код подтверждения отправлен на {signed.email}
            </span>
            <span>
              Редакция {signed.version} · IP {signed.signIp ?? "—"} · SHA-256 текста: <code style={{ wordBreak: "break-all" }}>{signed.sha256}</code>
            </span>
            {signed.revokedAt && <span className="form-error">Отозвано {fmtDateTime(signed.revokedAt)}</span>}
          </div>
        </article>
      </div>
    );
  }

  if (coachId !== me.id || me.role !== "COACH") {
    return (
      <div className="panel stack">
        <h1 className="h3">Соглашение не подписано</h1>
        <p className="muted">Тренер подпишет его сам при первом входе в кабинет — без подписи он не увидит заявки и контакты клиентов.</p>
      </div>
    );
  }

  const first = [coach.name, coach.patronymic].filter(Boolean).join(" ");
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h2" style={{ margin: 0 }}>
          Добро пожаловать в кабинет тренера
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          В кабинете вы будете видеть имена и телефоны клиентов, которые к вам записываются. По закону о персональных данных перед этим нужно подписать
          соглашение о конфиденциальности. Это займёт пару минут: заполните данные, прочитайте текст и подтвердите кодом из письма.
        </p>
      </div>
      <SignForm defaults={{ fullName: first, phone: coach.phone ?? "" }} email={coach.email} />
    </div>
  );
}
