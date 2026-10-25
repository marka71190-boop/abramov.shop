import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-errors";
import { getSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Регистрация", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  const settings = await getSettings();
  if (settings.pdPause) {
    return (
      <div className="stack" style={{ textAlign: "center" }}>
        <h1 className="h3">Регистрация временно закрыта</h1>
        <p className="muted">{settings.pdPauseMessage}</p>
        <p>
          <a href="/catalog">Смотреть каталог</a>
        </p>
      </div>
    );
  }
  return <RegisterForm next={safeNext(next)} />;
}
