"use client";
import Link from "next/link";
import { isExternal } from "@/lib/banners-shared";
import { trackBanner } from "./track";

/** Ссылка из баннера: внутренняя — через Link, внешняя — в новой вкладке */
export function BannerLink({
  id,
  title,
  url,
  className,
  children,
  hidden,
  label,
}: {
  id: string;
  title: string;
  url: string;
  className?: string;
  children?: React.ReactNode;
  hidden?: boolean;
  label?: string;
}) {
  const props = {
    className,
    onClick: () => trackBanner(id, title),
    ...(hidden ? { tabIndex: -1, "aria-hidden": true } : {}),
    ...(label ? { "aria-label": label } : {}),
  };
  if (isExternal(url))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  return (
    <Link href={url} {...props}>
      {children}
    </Link>
  );
}
