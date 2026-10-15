"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteInspectionMedia } from "@/app/admin/orders/[id]/inspection-actions";

export function DeleteMediaButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      {" · "}
      <button
        type="button"
        className="linklike small"
        disabled={pending}
        onClick={() =>
          confirm("Удалить файл? На Google Диске он попадёт в корзину.") &&
          start(async () => {
            const r = await deleteInspectionMedia(id);
            if (r.error) alert(r.error);
            router.refresh();
          })
        }
      >
        удалить
      </button>
    </>
  );
}
