"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
};

type Stats = {
  total: number;
  responded: number;
  safe: number;
  need_help: number;
  no_response: number;
  scope: string;
};

type ReportRow = {
  id: string;
  status: string;
  message: string | null;
  user: { id: string; name: string; email: string; department: { name: string } };
};

type Me = { role: string };

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">scope: {hint}</p>}
      </CardHeader>
    </Card>
  );
}

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const router = useRouter();
  const t = useTranslations("eventDetail");
  const ts = useTranslations("stats");
  const tc = useTranslations("common");
  const session = typeof window !== "undefined" ? getSession() : null;

  useEffect(() => {
    if (!getSession()) router.replace("/login");
  }, [router]);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/auth/me"),
    enabled: !!session,
  });

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiFetch<EventDetail>(`/events/${eventId}`),
    enabled: !!eventId && !!session,
  });

  const { data: stats } = useQuery({
    queryKey: ["event", eventId, "stats"],
    queryFn: () => apiFetch<Stats>(`/events/${eventId}/stats`),
    enabled: !!eventId && !!session,
  });

  const { data: myReport } = useQuery({
    queryKey: ["event", eventId, "report", "me"],
    queryFn: () => apiFetch<ReportRow | null>(`/events/${eventId}/reports/me`),
    enabled:
      !!eventId &&
      !!session &&
      (me?.role === "EMPLOYEE" || me?.role === "MANAGER"),
  });

  const { data: teamReports } = useQuery({
    queryKey: ["event", eventId, "reports", "team"],
    queryFn: () => apiFetch<ReportRow[]>(`/events/${eventId}/reports/team`),
    enabled: !!eventId && !!session && me?.role === "MANAGER",
  });

  const { data: allReports } = useQuery({
    queryKey: ["event", eventId, "reports", "all"],
    queryFn: () => apiFetch<ReportRow[]>(`/events/${eventId}/reports`),
    enabled: !!eventId && !!session && me?.role === "ADMIN",
  });

  const qc = useQueryClient();

  const reminder = useMutation({
    mutationFn: () =>
      apiFetch(`/events/${eventId}/reminders/run`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const reports =
    me?.role === "ADMIN" ? allReports : me?.role === "MANAGER" ? teamReports : undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{event?.title ?? tc("event")}</h1>
            {event?.description && (
              <p className="mt-2 text-muted-foreground">{event.description}</p>
            )}
            {event && (
              <Badge className="mt-2" variant="outline">
                {event.status}
              </Badge>
            )}
          </div>
          {(me?.role === "EMPLOYEE" || me?.role === "MANAGER") &&
            event?.status === "ACTIVE" && (
              <Link
                href={`/events/${eventId}/report`}
                className={cn(buttonVariants())}
              >
                {t("reportButton")}
              </Link>
            )}
        </div>

        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={ts("total")} value={stats.total} hint={stats.scope} />
            <StatCard label={ts("responded")} value={stats.responded} />
            <StatCard label={ts("safe")} value={stats.safe} />
            <StatCard label={ts("needHelp")} value={stats.need_help} />
            <StatCard label={ts("noResponse")} value={stats.no_response} />
          </div>
        )}

        {me?.role === "ADMIN" && event?.status === "ACTIVE" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("reminderTitle")}</CardTitle>
              <CardDescription>{t("reminderDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={reminder.isPending}
                onClick={() => reminder.mutate()}
              >
                {reminder.isPending ? tc("processing") : t("runReminder")}
              </Button>
              {reminder.isError && (
                <span className="text-sm text-destructive">
                  {reminder.error instanceof Error
                    ? reminder.error.message
                    : tc("operationFailed")}
                </span>
              )}
              {reminder.isSuccess && (
                <span className="text-sm text-muted-foreground">{t("reminderSent")}</span>
              )}
            </CardContent>
          </Card>
        )}

        {(me?.role === "EMPLOYEE" || me?.role === "MANAGER") && (
          <Card>
            <CardHeader>
              <CardTitle>{t("myReport")}</CardTitle>
              <CardDescription>{t("myReportDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {myReport ? (
                <div className="space-y-1 text-sm">
                  <p>
                    {t("statusLabel")}<Badge>{myReport.status}</Badge>
                  </p>
                  {myReport.message && <p>{t("messageLabel")}{myReport.message}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("notReported")}</p>
              )}
            </CardContent>
          </Card>
        )}

        {reports && (
          <Card>
            <CardHeader>
              <CardTitle>
                {me?.role === "ADMIN" ? t("allReports") : t("teamReports")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("name")}</TableHead>
                    <TableHead>{tc("department")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead>{tc("description")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.user.name}</TableCell>
                      <TableCell>{r.user.department.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {r.message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
