"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string;
  managerId: string | null;
  department: { id: string; name: string };
};

type Department = {
  id: string;
  name: string;
};

type FormMode = "none" | "create" | "edit";

const ROLES = ["EMPLOYEE", "MANAGER", "ADMIN"] as const;

function UserForm({
  mode,
  initial,
  departments,
  managers,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: UserRow;
  departments: Department[];
  managers: UserRow[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(initial?.role ?? "");
  const [attempted, setAttempted] = useState(false);
  const [departmentId, setDepartmentId] = useState(
    initial?.departmentId ?? ""
  );
  const [managerId, setManagerId] = useState<string>(
    initial?.managerId ?? ""
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (mode === "create") {
        return apiFetch("/users", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            password,
            role,
            departmentId,
            managerId: managerId || null,
          }),
        });
      }
      const body: Record<string, unknown> = { name, role, departmentId, managerId: managerId || null };
      if (password) body.password = password;
      return apiFetch(`/users/${initial!.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      onSuccess();
    },
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const errors = {
    name: name.trim().length === 0 ? t("errorName") : null,
    email:
      mode === "create"
        ? email.trim().length === 0
          ? t("errorEmailRequired")
          : !emailRegex.test(email)
          ? t("errorEmailFormat")
          : null
        : null,
    password:
      mode === "create" && password.length > 0 && password.length < 6
        ? t("errorPasswordLength")
        : mode === "create" && password.length === 0
        ? t("errorPasswordRequired")
        : null,
    role: role === "" ? t("errorRole") : null,
    departmentId: departmentId === "" ? t("errorDept") : null,
  };
  const isValid = Object.values(errors).every((e) => e === null);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{mode === "create" ? t("createFormTitle") : t("editFormTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{tc("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            {attempted && errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          {mode === "create" && (
            <div className="space-y-1">
              <Label>{tc("email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {attempted && errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label>{mode === "create" ? t("passwordLabel") : t("newPasswordLabel")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "edit" ? t("passwordEditPlaceholder") : t("passwordPlaceholder")}
            />
            {attempted && errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{tc("role")}</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("selectRolePlaceholder")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {attempted && errors.role && (
              <p className="text-xs text-destructive">{errors.role}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{tc("department")}</Label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("selectDeptPlaceholder")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {attempted && errors.departmentId && (
              <p className="text-xs text-destructive">{errors.departmentId}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{t("managerLabel")}</Label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("noManager")}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        {mutation.isError && (
          <p className="mt-2 text-sm text-destructive">
            {mutation.error instanceof Error
              ? mutation.error.message
              : tc("operationFailed")}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setAttempted(true);
              if (isValid) mutation.mutate();
            }}
          >
            {mutation.isPending ? tc("saving") : tc("save")}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {tc("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("adminUsers");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<FormMode>("none");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.user.role !== "ADMIN") router.replace("/dashboard");
    else setCurrentUserId(s.user.id);
  }, [router]);

  const enabled = mounted && getSession()?.user.role === "ADMIN";

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRow[]>("/users"),
    enabled,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiFetch<Department[]>("/departments"),
    enabled,
  });

  const managers = users?.filter((u) => u.role === "MANAGER") ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setConfirmDeleteId(null);
    },
  });

  function openCreate() {
    setEditingUser(null);
    setMode("create");
  }

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setMode("edit");
  }

  function closeForm() {
    setMode("none");
    setEditingUser(null);
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "管理" },
            { label: t("title") },
          ]}
        />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          {mode === "none" && (
            <Button onClick={openCreate}>{t("createButton")}</Button>
          )}
        </div>

        {(mode === "create" || mode === "edit") && (
          <UserForm
            mode={mode}
            initial={editingUser ?? undefined}
            departments={departments}
            managers={managers}
            onSuccess={closeForm}
            onCancel={closeForm}
          />
        )}

        <Card>
          <CardContent className="pt-4">
            {isLoading && (
              <p className="text-sm text-muted-foreground">{tc("loading")}</p>
            )}
            {users && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("name")}</TableHead>
                    <TableHead>{tc("email")}</TableHead>
                    <TableHead>{tc("role")}</TableHead>
                    <TableHead>{tc("department")}</TableHead>
                    <TableHead className="text-right">{t("actionsColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                          style={
                            u.role === "ADMIN"
                              ? { borderColor: "var(--destructive)", color: "var(--destructive)" }
                              : u.role === "MANAGER"
                              ? { borderColor: "var(--info)", color: "var(--info)" }
                              : { borderColor: "var(--border)", color: "var(--muted-foreground)" }
                          }
                        >
                          {u.role}
                        </span>
                      </TableCell>
                      <TableCell>{u.department.name}</TableCell>
                      <TableCell className="text-right">
                        {confirmDeleteId === u.id ? (
                          <span className="flex items-center justify-end gap-2">
                            <span className="text-sm text-destructive">
                              {t("confirmDelete")}
                            </span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(u.id)}
                            >
                              {tc("confirm")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              {tc("cancel")}
                            </Button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(u)}
                            >
                              {tc("edit")}
                            </Button>
                            {u.id !== currentUserId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteId(u.id)}
                              >
                                {tc("delete")}
                              </Button>
                            )}
                          </span>
                        )}
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
