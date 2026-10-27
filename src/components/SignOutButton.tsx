"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { unsubscribePush } from "@/components/pwa/pwa";

export function SignOutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Уведомления этого устройства — только для вошедшего: после выхода чужие заказы сюда не приходят
        await unsubscribePush().catch(() => {});
        await authClient.signOut();
        window.location.href = "/";
      }}
    >
      {children}
    </button>
  );
}
