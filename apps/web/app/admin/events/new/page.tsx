"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
        ? "請輸入標題"
        : title.trim().length < 2
        ? "標題至少 2 字元"
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
          <CardTitle>建立事件</CardTitle>
          <CardDescription>由管理員建立緊急事件並設定狀態。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">標題</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="至少 2 字元"
            />
            {attempted && errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="desc">說明（選填）</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>初始狀態</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={status === "ACTIVE" ? "default" : "outline"}
                onClick={() => setStatus("ACTIVE")}
              >
                ACTIVE（立即開放回報）
              </Button>
              <Button
                type="button"
                variant={status === "DRAFT" ? "secondary" : "outline"}
                onClick={() => setStatus("DRAFT")}
              >
                DRAFT
              </Button>
            </div>
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "建立失敗"}
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
              {mutation.isPending ? "建立中…" : "建立"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/admin/events")}
            >
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
