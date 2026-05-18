"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewEventPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("ACTIVE");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.user.role !== "ADMIN") router.replace("/dashboard");
  }, [router]);

  const errors = {
    title:
      title.trim().length === 0
        ? t("errorTitleRequired")
        : title.trim().length < 2
        ? t("errorTitleLength")
        : null,
  };
  const isValid = Object.values(errors).every((e) => e === null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/events", {
        method: "POST",
        body: JSON.stringify({ title, description, status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      router.push("/admin/events");
    },
  });

  return (
    <AppShell>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("createPageTitle")}</CardTitle>
          <CardDescription>{t("createPageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">{tc("title")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("errorTitleLength")}
            />
            {attempted && errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="desc">{t("descriptionLabel")}</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("initialStatus")}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={status === "ACTIVE" ? "default" : "outline"}
                onClick={() => setStatus("ACTIVE")}
              >
                {t("statusActiveLabel")}
              </Button>
              <Button
                type="button"
                variant={status === "DRAFT" ? "secondary" : "outline"}
                onClick={() => setStatus("DRAFT")}
              >
                {t("statusDraftLabel")}
              </Button>
            </div>
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error
                ? mutation.error.message
                : t("createFailed")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={mutation.isPending}
              onClick={() => {
                setAttempted(true);
                if (isValid) mutation.mutate();
              }}
            >
              {mutation.isPending ? t("creating") : t("createButton")}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/admin/events")}
            >
              {tc("cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
