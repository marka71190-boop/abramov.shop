import type { Metadata } from "next";
import Link from "next/link";
import { clubTitle } from "@/lib/club-label";
import { listClubs } from "@/lib/clubs";
import { GAMES, lastApplication, RANKS } from "@/lib/coach-apply";
import { hasRole } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = {
  title: "Стать тренером",
  description: "Тренируете по русскому бильярду? Подайте заявку — разместим ваш профиль и расписание на сайте Abramov, ученики будут записываться онлайн.",
};
export const dynamic = "force-dynamic";

export default async function BecomeCoach() {
  const [me, clubs] = await Promise.all([getViewer(), listClubs()]);
  const last = me ? await lastApplication(me.id) : null;
  const isCoach = hasRole(me, "COACH");

  return (
    <div className="container stack coach-apply" style={{ gap: 24, paddingBlock: 32, maxWidth: 860 }}>
      <nav className="small muted">
        <Link href="/trenirovki">Тренировки</Link> / Стать тренером
      </nav>
      <h1 className="h2" style={{ margin: 0 }}>
        Стать тренером Abramov
      </h1>

      <div className="coach-apply__rule" role="note">
        <div className="coach-apply__big">Тренировки — только в наших клубах</div>
        <p style={{ margin: 0 }}>
          Сайт записывает учеников на занятия в клубах сети. Проводить тренировки учеников с сайта в других бильярдных нельзя. Выберите в заявке клубы, где вам удобно работать:
        </p>
        <ul className="coach-apply__clubs">
          {clubs.map((c) => (
            <li key={c.id}>
              {clubTitle(c)}, <span className="muted">{c.city}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h2 className="h4" style={{ margin: 0 }}>
          Что даёт размещение
        </h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Ваш профиль и расписание на странице «Тренировки»</li>
          <li>Онлайн-запись учеников на свободное время и групповые занятия</li>
          <li>Кабинет тренера: дневник, заявки, напоминания ученикам в Telegram и на почту</li>
          <li>Пробное занятие для новых учеников — по вашему выбору</li>
        </ul>
      </div>

      {isCoach ? (
        <div className="notice">
          Вы уже тренер Abramov. <Link href="/coach">Открыть кабинет тренера →</Link>
        </div>
      ) : !me ? (
        <div className="notice notice--muted stack" style={{ gap: 10 }}>
          <span>Чтобы подать заявку, войдите или зарегистрируйтесь — после одобрения кабинет тренера откроется в этом же аккаунте.</span>
          <div className="row" style={{ gap: 10 }}>
            <Link href="/login?next=/trenirovki/stat-trenerom" className="btn btn--gold btn--sm">
              Войти
            </Link>
            <Link href="/register?next=/trenirovki/stat-trenerom" className="btn btn--line btn--sm">
              Зарегистрироваться
            </Link>
          </div>
        </div>
      ) : last?.status === "NEW" ? (
        <div className="notice" role="status">
          <b>Заявка на рассмотрении</b> — отправлена {last.createdAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}. Ответим в Telegram или на почту.
        </div>
      ) : (
        <>
          {last?.status === "REJECTED" && (
            <div className="notice notice--muted">
              Прошлая заявка отклонена{last.reply ? `: ${last.reply}` : "."} Можно подать новую.
            </div>
          )}
          <ApplyForm
            clubs={clubs.map((c) => ({ id: c.id, name: c.name, city: c.city, address: c.address }))}
            games={GAMES}
            ranks={RANKS}
            defaults={{ fullName: me.name ?? "", phone: me.phone ?? "", city: "" }}
          />
        </>
      )}
    </div>
  );
}
