import Link from "next/link";
import { rub } from "@/lib/format";
import { dayKey, fmtDay, fmtTime, KIND_LABEL, type SlotView } from "@/lib/trainings";
import { BookButton } from "./BookButton";

/** Расписание по дням: время, тренер, клуб, места, цена, кнопка записи */
export function Schedule({ slots, signedIn, next, mine, showCoach = true }: { slots: SlotView[]; signedIn: boolean; next: string; mine: Map<string, string>; showCoach?: boolean }) {
  const days = new Map<string, SlotView[]>();
  for (const x of slots) days.set(dayKey(x.slot.startsAt), [...(days.get(dayKey(x.slot.startsAt)) ?? []), x]);
  return (
    <div className="schedule">
      {[...days.values()].map((list) => (
        <div key={dayKey(list[0].slot.startsAt)} className="schedule__day">
          <div className="schedule__date">{fmtDay(list[0].slot.startsAt)}</div>
          {list.map(({ slot, club, coach, left }) => (
            <div key={slot.id} className="schedule__row" id={`s-${slot.id}`}>
              <div className="schedule__time">
                <b>{fmtTime(slot.startsAt)}</b>
                <span className="small muted">{slot.durationMin} мин</span>
              </div>
              <div className="schedule__what">
                <b>{slot.title}</b>
                <div className="small muted">
                  {showCoach && (
                    <>
                      <Link href={`/trenirovki/${coach.slug}`}>{coach.displayName}</Link> ·{" "}
                    </>
                  )}
                  {club.name}, {club.city} · {KIND_LABEL[slot.kind]}
                  {slot.kind === "GROUP" ? ` · свободно ${left} из ${slot.capacity}` : ""}
                </div>
                {slot.note && <div className="small">{slot.note}</div>}
              </div>
              <div className="schedule__price">{slot.price ? rub(slot.price) : "Бесплатно"}</div>
              <div className="schedule__action">
                <BookButton slotId={slot.id} left={left} signedIn={signedIn} next={`${next}#s-${slot.id}`} mineId={mine.get(slot.id) ?? null} coachName={coach.displayName} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
