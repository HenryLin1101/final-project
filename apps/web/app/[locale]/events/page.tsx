"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { apiFetch, getSession, type StoredSession } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EventRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export default function EventsPage() {
  const router = useRouter();
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    setMounted(true);
    const s = getSession();
    setSession(s);
    if (!s) router.replace("/login");
    else if (s.user.role === "ADMIN") router.replace("/admin/events");
  }, [router]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<EventRow[]>("/events"),
    enabled: mounted && session != null && session.user.role !== "ADMIN",
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("cardTitle")}</CardTitle>
            <CardDescription>
              {session?.user.role === "EMPLOYEE"
                ? t("cardDescriptionEmployee")
                : t("cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <div className="text-sm text-muted-foreground">{tc("loading")}</div>}
            {events && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("title")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead>{tc("createdAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link
                          href={`/events/${e.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {e.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={e.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(e.createdAt).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
