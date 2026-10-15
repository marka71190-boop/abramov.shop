"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelMyReturn } from "@/app/(shop)/order/[number]/return/actions";

export function CancelReturnButton({ number }: { number: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        className="linklike small"
        disabled={pending}
        onClick={() =>
          confirm("Отменить заявку?") &&
          start(async () => {
            const r = await cancelMyReturn(number);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Отменяем…" : "Отменить заявку"}
      </button>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
