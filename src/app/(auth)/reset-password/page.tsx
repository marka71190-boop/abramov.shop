import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetForm token={token ?? null} invalid={error === "INVALID_TOKEN" || !token} />;
}
