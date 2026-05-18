"use client";

import { useEffect, useState } from "react";
import { useRouter, Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { clearSession, getSession } from "@/lib/api";
import type { StoredSession } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const qc = useQueryClient();
  const t = useTranslations("nav");
  const ta = useTranslations("auth");
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const logout = () => {
    clearSession();
    qc.clear();
    setSession(null);
    router.push("/login");
    router.refresh();
  };

  const switchLocale = (next: Locale) => {
    router.replace(pathname, { locale: next });
  };

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/dashboard" className="font-semibold">
            {t("brand")}
          </Link>
          <Link href="/events" className="text-muted-foreground hover:text-foreground">
            {t("events")}
          </Link>
          <Link
            href="/notifications"
            className="text-muted-foreground hover:text-foreground"
          >
            {t("notifications")}
          </Link>
          {session?.user.role === "ADMIN" && (
            <>
              <Link
                href="/admin/events/new"
                className="text-muted-foreground hover:text-foreground"
              >
                {t("createEvent")}
              </Link>
              <Link
                href="/admin/users"
                className="text-muted-foreground hover:text-foreground"
              >
                {t("users")}
              </Link>
              <Link
                href="/admin/audit"
                className="text-muted-foreground hover:text-foreground"
              >
                {t("audit")}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center rounded border text-xs">
            <button
              onClick={() => switchLocale("zh-TW")}
              className={`px-2 py-1 transition-colors ${
                locale === "zh-TW"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
            >
              中文
            </button>
            <button
              onClick={() => switchLocale("en")}
              className={`px-2 py-1 transition-colors ${
                locale === "en"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
            >
              EN
            </button>
          </div>
          {session && (
            <>
              <span className="hidden sm:inline">{session.user.name}</span>
              <span className="rounded bg-muted px-2 py-0.5">{session.user.role}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                {ta("logout")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
