"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectDriveAction } from "../shop-actions";

export function DriveDisconnect() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn--line btn--sm"
      disabled={pending}
      onClick={() =>
        confirm("Отключить Google Диск? Файлы на Диске останутся, но новые загружать будет нельзя, пока не подключите снова.") &&
        start(async () => {
          await disconnectDriveAction();
          router.refresh();
        })
      }
    >
      Отключить
    </button>
  );
}
