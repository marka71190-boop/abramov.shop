"use client";

/** Отдельное согласие на передачу имени и телефона тренеру (152-ФЗ): не отмечено заранее, своей строкой */
export function CoachConsent({ coachName, checked, onChange }: { coachName: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check coach-consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        Согласен, чтобы тренер {coachName} получил мои имя и телефон для связи по записи на тренировку (
        <a href="/p/coach-consent" target="_blank" rel="noopener">
          согласие
        </a>
        )
      </span>
    </label>
  );
}
