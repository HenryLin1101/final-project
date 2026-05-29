"use client";

import { useEffect, useState } from "react";
import { useRouter, Link, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
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
  const td = useTranslations("dashboard");
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
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/dashboard" className="px-2 py-2 font-semibold">
            {t("brand")}
          </Link>
          {session?.user.role !== "ADMIN" && (
            <Link
              href="/events"
              className={`px-2 py-2 transition-colors ${
                pathname.startsWith("/events")
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("events")}
            </Link>
          )}
          <Link
            href="/notifications"
            className={`px-2 py-2 transition-colors ${
              pathname.startsWith("/notifications")
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("notifications")}
          </Link>
          {session?.user.role === "ADMIN" && (
            <>
              <Link
                href="/admin/events"
                className={`px-2 py-2 transition-colors ${
                  pathname.startsWith("/admin/events")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {td("eventManagement")}
              </Link>
              <Link
                href="/admin/users"
                className={`px-2 py-2 transition-colors ${
                  pathname.startsWith("/admin/users")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("users")}
              </Link>
              <Link
                href="/admin/audit"
                className={`px-2 py-2 transition-colors ${
                  pathname.startsWith("/admin/audit")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("audit")}
              </Link>
              <Link
                href="/admin/queues"
                className={`px-2 py-2 transition-colors ${
                  pathname.startsWith("/admin/queues")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("queues")}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-0.5 text-xs">
            <Globe className="mr-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => switchLocale("zh-TW")}
              className={`rounded px-1.5 py-1 transition-colors ${
                locale === "zh-TW"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              中文
            </button>
            <span className="select-none text-muted-foreground/40">·</span>
            <button
              onClick={() => switchLocale("en")}
              className={`rounded px-1.5 py-1 transition-colors ${
                locale === "en"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
