const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000/api/v1";

export type StoredSession = {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: "EMPLOYEE" | "MANAGER" | "ADMIN";
    departmentId: string | null;
  };
};

const SESSION_KEY = "esr_session";

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...init, headers });
  // 帶舊 token 卻 401（過期、重跑 seed、換 JWT_SECRET 等）→ 清 session 並回登入頁。
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    session?.access_token &&
    !path.includes("auth/login")
  ) {
    clearSession();
    window.location.replace("/login");
    throw new Error("登入已過期或無效，請重新登入");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : String(body.message);
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_BASE };
