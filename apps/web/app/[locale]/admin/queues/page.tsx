"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
import { apiFetch, getSession, API_BASE } from "@/lib/api";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type ChartPoint = {
  time: string;
  rps: number;
  waiting: number;
  active: number;
  p95: number;
};

const CHART_WINDOW = 30; // ~1 min of history at 2s polling

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

type MetricsSummary = {
  pod: string;
  uptime_seconds: number;
  requests: {
    total: number;
    by_status: Record<string, number>;
  };
  latency_seconds: {
    avg: number;
    p95: number;
  };
  memory_mb: number;
};

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

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

  const { data: metrics } = useQuery({
    queryKey: ["admin-metrics-summary"],
    queryFn: () => apiFetch<MetricsSummary>("/admin/queues/metrics-summary"),
    enabled: mounted && getSession()?.user.role === "ADMIN",
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  const lastRequestsRef = useRef<{ value: number; at: number } | null>(null);
  const [rps, setRps] = useState<number | null>(null);

  useEffect(() => {
    if (!metrics) return;
    const now = Date.now();
    const current = metrics.requests.total;
    const last = lastRequestsRef.current;
    if (last) {
      const deltaSec = (now - last.at) / 1000;
      const deltaCount = current - last.value;
      if (deltaSec > 0 && deltaCount >= 0) {
        setRps(deltaCount / deltaSec);
      }
    }
    lastRequestsRef.current = { value: current, at: now };
  }, [metrics]);

  const errorRate =
    metrics && metrics.requests.total > 0
      ? (metrics.requests.by_status["5xx"] / metrics.requests.total) * 100
      : 0;

  // Time-series buffer for the live chart: appends one point per poll, keeps
  // only the last CHART_WINDOW samples (~1 min at 2s interval).
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  useEffect(() => {
    if (!data || !metrics || rps === null) return;
    const time = new Date().toLocaleTimeString(undefined, {
      hour12: false,
      minute: "2-digit",
      second: "2-digit",
    });
    setChartData((prev) => {
      const next: ChartPoint = {
        time,
        rps: Number(rps.toFixed(2)),
        waiting: data.counts.waiting,
        active: data.counts.active,
        p95: Math.round(metrics.latency_seconds.p95 * 1000),
      };
      const updated = [...prev, next];
      return updated.length > CHART_WINDOW
        ? updated.slice(-CHART_WINDOW)
        : updated;
    });
  }, [data, metrics, rps]);

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

      {metrics && (
        <>
          <h2 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("httpSection")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("http.totalRequests")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {metrics.requests.total.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  2xx:{" "}
                  <span style={{ color: "var(--success)" }}>
                    {metrics.requests.by_status["2xx"].toLocaleString()}
                  </span>{" "}
                  · 4xx:{" "}
                  <span style={{ color: "var(--warning)" }}>
                    {metrics.requests.by_status["4xx"].toLocaleString()}
                  </span>{" "}
                  · 5xx:{" "}
                  <span style={{ color: "var(--destructive)" }}>
                    {metrics.requests.by_status["5xx"].toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("http.rps")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {rps === null ? "—" : rps.toFixed(1)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("http.rpsHint")}
                </div>
              </CardContent>
            </Card>
            <Card
              style={{
                borderColor:
                  errorRate > 5 ? "var(--destructive)" : undefined,
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("http.errorRate")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{
                    color:
                      errorRate > 5
                        ? "var(--destructive)"
                        : errorRate > 1
                          ? "var(--warning)"
                          : "var(--success)",
                  }}
                >
                  {errorRate.toFixed(2)}%
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("http.errorRateHint")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("http.latency")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {Math.round(metrics.latency_seconds.p95 * 1000)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    ms
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("http.latencyHint", {
                    avg: Math.round(metrics.latency_seconds.avg * 1000),
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {chartData.length > 1 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">{t("chartTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("chartSubtitle", { window: CHART_WINDOW * 2 })}
            </p>
          </CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickMargin={6}
                />
                <YAxis
                  yAxisId="count"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={40}
                />
                <YAxis
                  yAxisId="ms"
                  orientation="right"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={40}
                  tickFormatter={(v: number) => `${v}ms`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="line"
                  iconSize={12}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="rps"
                  name={t("chart.rps")}
                  stroke="var(--info)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="waiting"
                  name={t("chart.waiting")}
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="count"
                  type="monotone"
                  dataKey="active"
                  name={t("chart.active")}
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="p95"
                  name={t("chart.p95")}
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("queueSection")}
          </h2>
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
              {metrics && (
                <>
                  <div>
                    <span className="font-medium text-foreground">
                      {t("servingPod")}:
                    </span>{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {metrics.pod}
                    </code>{" "}
                    <span className="text-xs">{t("servingPodHint")}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      {t("uptime")}:
                    </span>{" "}
                    {formatUptime(metrics.uptime_seconds)}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      {t("memory")}:
                    </span>{" "}
                    {metrics.memory_mb} MB
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
