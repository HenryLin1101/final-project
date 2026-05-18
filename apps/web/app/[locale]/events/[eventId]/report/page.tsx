"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ReportPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("report");
  const [status, setStatus] = useState<"SAFE" | "NEED_HELP">("SAFE");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!getSession()) router.replace("/login");
  }, [router]);

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () =>
      apiFetch<{ id: string; title: string; status: string }>(`/events/${eventId}`),
    enabled: !!eventId && !!getSession(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/events/${eventId}/reports`, {
        method: "POST",
        body: JSON.stringify({ status, message: message || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      qc.invalidateQueries({ queryKey: ["event", eventId, "stats"] });
      qc.invalidateQueries({ queryKey: ["event", eventId, "report", "me"] });
      router.push(`/events/${eventId}`);
    },
  });

  if (event && event.status !== "ACTIVE") {
    return (
      <AppShell>
        <p className="text-muted-foreground">{t("notActive")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{event?.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("statusLabel")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={status === "SAFE" ? "default" : "outline"}
                onClick={() => setStatus("SAFE")}
              >
                {t("safe")}
              </Button>
              <Button
                type="button"
                variant={status === "NEED_HELP" ? "destructive" : "outline"}
                onClick={() => setStatus("NEED_HELP")}
              >
                {t("needHelp")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="msg">{t("messageLabel")}</Label>
            <Input
              id="msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error
                ? mutation.error.message
                : t("submitFailed")}
            </p>
          )}
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
