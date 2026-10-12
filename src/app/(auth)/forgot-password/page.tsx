import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Восстановление пароля", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const settings = await getSettings();
  return <ForgotForm telegram={settings.supportTelegram} />;
}
