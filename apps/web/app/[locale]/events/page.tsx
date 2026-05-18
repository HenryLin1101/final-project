"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { apiFetch, getSession } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    if (!getSession()) router.replace("/login");
  }, [router]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiFetch<EventRow[]>("/events"),
    enabled: typeof window !== "undefined" && !!getSession(),
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
            <CardDescription>{t("cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">{tc("loading")}</p>}
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
                        <Badge variant="secondary">{e.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(e.createdAt).toLocaleString()}
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
