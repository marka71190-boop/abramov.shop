"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        window.location.href = "/";
      }}
    >
      {children}
    </button>
  );
}
