"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Breadcrumb } from "@/components/breadcrumb";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AuditItem = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  createdAt: string;
  actor: { email: string; name: string } | null;
};

type AuditResponse = {
  items: AuditItem[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function AdminAuditPage() {
  const router = useRouter();
  const t = useTranslations("audit");
  const tc = useTranslations("common");

  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    setMounted(true);
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.user.role !== "ADMIN") router.replace("/dashboard");
  }, [router]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-logs", page, limit],
    queryFn: () =>
      apiFetch<AuditResponse>(`/audit-logs?page=${page}&limit=${limit}`),
    enabled: mounted && getSession()?.user.role === "ADMIN",
    placeholderData: keepPreviousData,
  });

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1),
    [data],
  );
  const pageStart = data ? (data.page - 1) * data.limit + 1 : 0;
  const pageEnd = data ? Math.min(data.page * data.limit, data.total) : 0;
  const canPrev = page > 1;
  const canNext = data ? page < totalPages : false;

  return (
    <AppShell>
      <Breadcrumb items={[{ label: "管理" }, { label: t("title") }]} />
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground">{tc("loading")}</p>
          )}
          {data && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {data.total > 0
                    ? t("paginatedSummary", {
                        start: pageStart,
                        end: pageEnd,
                        total: data.total,
                      })
                    : t("emptySummary")}
                  {isFetching && (
                    <span
                      className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ backgroundColor: "var(--info)" }}
                    />
                  )}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <label htmlFor="pageSize" className="text-muted-foreground">
                    {t("pageSize")}
                  </label>
                  <Select
                    value={String(limit)}
                    onValueChange={(v) => {
                      setLimit(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="pageSize" className="h-7 w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                        {new Date(row.createdAt).toLocaleDateString("zh-TW", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{row.actor?.email ?? "—"}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={
                            row.action.startsWith("CREATE")
                              ? {
                                  backgroundColor: "var(--info-bg)",
                                  color: "var(--info)",
                                  border: "1px solid var(--info)",
                                }
                              : row.action.startsWith("UPDATE")
                                ? {
                                    backgroundColor: "var(--warning-bg)",
                                    color: "var(--warning)",
                                    border: "1px solid var(--warning)",
                                  }
                                : row.action.startsWith("DELETE")
                                  ? {
                                      backgroundColor:
                                        "oklch(0.977 0.013 17.38)",
                                      color: "var(--destructive)",
                                      border: "1px solid var(--destructive)",
                                    }
                                  : {
                                      backgroundColor: "var(--muted)",
                                      color: "var(--muted-foreground)",
                                      border: "1px solid var(--border)",
                                    }
                          }
                        >
                          {row.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{row.resource}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("pageOf", { current: data.page, total: totalPages })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!canPrev || isFetching}
                  >
                    <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                    {t("prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!canNext || isFetching}
                  >
                    {t("next")}
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
