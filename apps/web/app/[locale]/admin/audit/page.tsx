"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { apiFetch, getSession } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AuditItem = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  actor: { email: string; name: string } | null;
};

type AuditResponse = { items: AuditItem[]; total: number; page: number };

export default function AdminAuditPage() {
  const router = useRouter();
  const t = useTranslations("audit");
  const tc = useTranslations("common");

  useEffect(() => {
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.user.role !== "ADMIN") router.replace("/dashboard");
  }, [router]);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => apiFetch<AuditResponse>("/audit-logs?limit=50"),
    enabled: getSession()?.user.role === "ADMIN",
  });

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{tc("loading")}</p>}
          {data && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("summary", { total: data.total, count: data.items.length })}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("timeColumn")}</TableHead>
                    <TableHead>{t("actorColumn")}</TableHead>
                    <TableHead>{t("actionColumn")}</TableHead>
                    <TableHead>{t("resourceColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{row.actor?.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.resource}
                        {row.resourceId ? ` / ${row.resourceId}` : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
