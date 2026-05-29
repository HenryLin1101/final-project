"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { apiFetch, getSession, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type QueueStats = {
  queue: string;
  enabled: boolean;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
};

type StatKey = keyof QueueStats["counts"];

const STAT_ORDER: StatKey[] = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
];

// Semantic colour mapping aligned with the global colour system in
// apps/web/app/globals.css (--info / --warning / --success / --destructive).
const STAT_STYLES: Record<
  StatKey,
  { fg: string; bg: string; border: string; pulse?: boolean }
> = {
  waiting: {
    fg: "var(--info)",
    bg: "var(--info-bg)",
    border: "var(--info)",
  },
  active: {
    fg: "var(--warning)",
    bg: "var(--warning-bg)",
    border: "var(--warning)",
    pulse: true,
  },
  completed: {
    fg: "var(--success)",
    bg: "var(--success-bg)",
    border: "var(--success)",
  },
  failed: {
    fg: "var(--destructive)",
    bg: "oklch(0.977 0.013 17.38)",
    border: "var(--destructive)",
  },
  delayed: {
    fg: "var(--muted-foreground)",
    bg: "var(--muted)",
    border: "var(--border)",
  },
  paused: {
    fg: "var(--muted-foreground)",
    bg: "var(--muted)",
    border: "var(--border)",
  },
};

export default function AdminQueuesPage() {
  const router = useRouter();
  const t = useTranslations("adminQueues");
  const tc = useTranslations("common");

  const [mounted, setMounted] = useState(false);
  const lastCompletedRef = useRef<{ value: number; at: number } | null>(null);
  const [completedRate, setCompletedRate] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.user.role !== "ADMIN") router.replace("/dashboard");
  }, [router]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["admin-queue-stats"],
    queryFn: () => apiFetch<QueueStats>("/admin/queues/stats"),
    enabled: mounted && getSession()?.user.role === "ADMIN",
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!data?.enabled) return;
    const now = Date.now();
    const current = data.counts.completed;
    const last = lastCompletedRef.current;
    if (last) {
      const deltaSec = (now - last.at) / 1000;
      const deltaCount = current - last.value;
      if (deltaSec > 0 && deltaCount >= 0) {
        setCompletedRate(deltaCount / deltaSec);
      }
    }
    lastCompletedRef.current = { value: current, at: now };
  }, [data]);

  const dashboardUrl = useMemo(() => {
    // bull-board is mounted on the API host, at /admin/queues (not /api/v1/...).
    // Derive its origin from NEXT_PUBLIC_API_URL.
    try {
      const u = new URL(API_BASE);
      return `${u.protocol}//${u.host}/admin/queues`;
    } catch {
      return "/admin/queues";
    }
  }, []);

  return (
    <AppShell>
      <Breadcrumb items={[{ label: tc("admin") }, { label: t("title") }]} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="mr-1 h-4 w-4" />
          {t("openBullBoard")}
        </a>
      </div>

      {!data?.enabled && data && (
        <Card className="mb-4 border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            {t("disabledHint")}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      )}
      {error && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {STAT_ORDER.map((key) => {
              const style = STAT_STYLES[key];
              const value = data.counts[key];
              return (
                <Card
                  key={key}
                  style={{
                    borderColor: style.border,
                    backgroundColor: style.bg,
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="flex items-center justify-between text-xs uppercase tracking-wider"
                      style={{ color: style.fg }}
                    >
                      <span>{t(`stats.${key}`)}</span>
                      {style.pulse && value > 0 && (
                        <span
                          className="inline-block h-2 w-2 animate-pulse rounded-full"
                          style={{ backgroundColor: style.fg }}
                        />
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="text-3xl font-bold tabular-nums"
                      style={{ color: style.fg }}
                    >
                      {value.toLocaleString()}
                    </div>
                    {key === "completed" && completedRate !== null && (
                      <div
                        className="mt-1 text-xs"
                        style={{ color: style.fg, opacity: 0.7 }}
                      >
                        {completedRate >= 0.1
                          ? t("ratePerSec", {
                              rate: completedRate.toFixed(1),
                            })
                          : t("rateIdle")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">{t("queueInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">
                  {t("queueName")}:
                </span>{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {data.queue}
                </code>
              </div>
              <div>
                <span className="font-medium text-foreground">
                  {t("polling")}:
                </span>{" "}
                {t("pollingValue")}
                {isFetching && (
                  <span
                    className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: "var(--info)" }}
                  />
                )}
              </div>
              <div>
                <span className="font-medium text-foreground">
                  {t("backendStatus")}:
                </span>{" "}
                {data.enabled ? (
                  <span style={{ color: "var(--success)" }}>
                    ● {t("backendEnabled")}
                  </span>
                ) : (
                  <span style={{ color: "var(--muted-foreground)" }}>
                    ○ {t("backendDisabled")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
