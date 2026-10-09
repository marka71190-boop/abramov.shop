import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGoogleEnabled, isVkEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/auth-errors";
import { getViewer } from "@/lib/viewer";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Регистрация", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; from?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next, from } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  return <RegisterForm next={safeNext(next)} google={isGoogleEnabled} vk={isVkEnabled} socialFailed={from === "google" || from === "vk" ? from : null} />;
}
