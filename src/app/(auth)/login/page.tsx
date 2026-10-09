import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGoogleEnabled, isVkEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/auth-errors";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  return <LoginForm next={safeNext(next)} google={isGoogleEnabled} vk={isVkEnabled} />;
}
