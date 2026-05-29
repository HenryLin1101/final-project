"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { apiFetch, getSession } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Me = {
  id: string;
  email: string;
  name: string;
  role: string;
  department: { id: string; name: string } | null;
};

type EventRow = {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
};

type NotificationRow = {
  id: string;
  readAt: string | null;
};

type StatsResult = {
  total: number;
  responded: number;
  safe: number;
  need_help: number;
  no_response: number;
};

function EventStatCard({ event }: { event: EventRow }) {
  const ts = useTranslations("stats");
  const td = useTranslations("dashboard");
  const tc = useTranslations("common");
  const { data: stats } = useQuery({
    queryKey: ["stats", event.id],
    queryFn: () => apiFetch<StatsResult>(`/events/${event.id}/stats`),
  });

  return (
    <Link href={`/events/${event.id}`}>
      <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{event.title}</CardTitle>
            <Badge variant="default">ACTIVE</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-muted-foreground">{ts("total")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {stats.responded}
                </p>
                <p className="text-muted-foreground">{ts("responded")}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">
                  {stats.no_response}
                </p>
                <p className="text-muted-foreground">{ts("noResponse")}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{tc("loading")}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{td("tapToView")}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const t = useTranslations("dashboard");

  useEffect(() => {
    if (!getSession()) router.replace("/login");
  }, [router]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/auth/me"),
    enabled: mounted && !!getSession(),
  });

  const { data: allEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<EventRow[]>("/events"),
    enabled: !!me,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationRow[]>("/notifications"),
    enabled: !!me,
  });

  const activeEvents = allEvents?.filter((e) => e.status === "ACTIVE") ?? [];
  const activeCount = activeEvents.length;
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;
  const eventsListHref = me?.role === "ADMIN" ? "/admin/events" : "/events";

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {me && (
          <div
            className={
              me.role === "EMPLOYEE"
                ? "grid grid-cols-2 gap-4 sm:grid-cols-3"
                : "grid max-w-sm grid-cols-1 gap-4"
            }
          >
            {me.role === "EMPLOYEE" && (
              <Link href={eventsListHref}>
                <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardDescription>{t("activeEvents")}</CardDescription>
                    <CardTitle
                      className="text-3xl"
                      style={{ color: activeCount > 0 ? "var(--info)" : undefined }}
                    >
                      {activeCount}
                    </CardTitle>
                    <CardDescription className="text-xs">{t("tapToView")}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
            <Link href="/notifications">
              <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <CardDescription>{t("unreadNotifications")}</CardDescription>
                  <CardTitle
                    className="text-3xl"
                    style={{ color: unreadCount > 0 ? "var(--warning)" : undefined }}
                  >
                    {unreadCount}
                  </CardTitle>
                  <CardDescription className="text-xs">{t("tapToView")}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        )}

        {me && (
          <Card>
            <CardHeader>
              <CardTitle>{t("greeting", { name: me.name })}</CardTitle>
              <CardDescription>
                {me.email} · {me.role}
                {me.department ? ` · ${me.department.name}` : ` · ${t("systemAdmin")}`}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {me?.role === "MANAGER" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {t("myTeamEvents")}
                {activeCount > 0 && (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    ({activeCount})
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("teamEventsSubtitle")}
              </p>
            </div>
            {activeEvents.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  {t("noActiveEvents")}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeEvents.map((event) => (
                  <EventStatCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
