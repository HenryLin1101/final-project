/**
 * k6 業務情境負載測試腳本
 *
 * 執行方式（需先啟動完整 stack）：
 *   docker compose up --build -d
 *   BASE_URL=http://localhost k6 run infra/k6/business.js
 *
 * 若沒有 seed 資料，可指定不同帳密：
 *   BASE_URL=http://localhost ADMIN_EMAIL=admin@demo.com ADMIN_PASS=Password123! k6 run infra/k6/business.js
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── 自訂指標 ─────────────────────────────────────────────────────────────────
const loginErrors = new Rate("login_error_rate");
const reportSubmitDuration = new Trend("report_submit_duration", true);

// ── 測試設定 ─────────────────────────────────────────────────────────────────
export const options = {
  stages: [
    { duration: "30s", target: 10 }, // Stage 1: 暖機，0→10 VU
    { duration: "1m", target: 10 },  // Stage 2: 穩定負載，10 VU 持續 1 分鐘
    { duration: "10s", target: 0 },  // Stage 3: 冷卻
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],           // 失敗率 < 1%
    http_req_duration: ["p(95)<800"],         // p95 回應時間 < 800ms
    report_submit_duration: ["p(95)<1000"],   // 回報 API p95 < 1000ms
    login_error_rate: ["rate<0.05"],          // 登入失敗率 < 5%
  },
};

const BASE = __ENV.BASE_URL || "http://localhost";
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || "admin@demo.com";
const ADMIN_PASS = __ENV.ADMIN_PASS || "Password123!";
const EMP_EMAIL = __ENV.EMP_EMAIL || "employee1@demo.com";
const EMP_PASS = __ENV.EMP_PASS || "Password123!";

const JSON_HEADERS = { "Content-Type": "application/json" };

// ── 工具函式 ─────────────────────────────────────────────────────────────────
function login(email, password) {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS },
  );
  const ok = check(res, {
    "login 200": (r) => r.status === 200,
    "login has access_token": (r) => {
      try {
        return !!JSON.parse(r.body).access_token;
      } catch {
        return false;
      }
    },
  });
  loginErrors.add(!ok);
  if (!ok) return null;
  return JSON.parse(res.body).access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── 主要情境 ─────────────────────────────────────────────────────────────────
export default function () {
  // ── 情境 A：健康檢查（基準線）
  group("health_check", function () {
    const res = http.get(`${BASE}/health`);
    check(res, { "health 200": (r) => r.status === 200 });
    sleep(0.1);
  });

  // ── 情境 B：ADMIN 登入 → 建立事件 → 查看所有回報
  group("admin_workflow", function () {
    const token = login(ADMIN_EMAIL, ADMIN_PASS);
    if (!token) return;

    // 列出所有事件
    const eventsRes = http.get(`${BASE}/api/v1/events`, {
      headers: authHeaders(token),
    });
    check(eventsRes, { "admin list events 200": (r) => r.status === 200 });

    // 若有事件，查看第一個的全公司回報統計
    let events;
    try { events = JSON.parse(eventsRes.body); } catch { events = []; }
    if (Array.isArray(events) && events.length > 0) {
      const eventId = events[0].id;
      const statsRes = http.get(`${BASE}/api/v1/events/${eventId}/stats`, {
        headers: authHeaders(token),
      });
      check(statsRes, { "admin stats 200": (r) => r.status === 200 });
    }

    sleep(0.5);
  });

  // ── 情境 C：EMPLOYEE 登入 → 查看事件 → 提交安全回報
  group("employee_report", function () {
    const token = login(EMP_EMAIL, EMP_PASS);
    if (!token) return;

    // 列出進行中事件
    const eventsRes = http.get(`${BASE}/api/v1/events`, {
      headers: authHeaders(token),
    });
    check(eventsRes, { "employee list events 200": (r) => r.status === 200 });

    let events;
    try { events = JSON.parse(eventsRes.body); } catch { events = []; }

    const activeEvents = Array.isArray(events)
      ? events.filter((e) => e.status === "ACTIVE")
      : [];

    if (activeEvents.length > 0) {
      const eventId = activeEvents[0].id;

      // 提交安全回報
      const status = Math.random() > 0.2 ? "SAFE" : "NEED_HELP";
      const start = Date.now();
      const reportRes = http.post(
        `${BASE}/api/v1/events/${eventId}/reports`,
        JSON.stringify({ status }),
        { headers: authHeaders(token) },
      );
      reportSubmitDuration.add(Date.now() - start);

      check(reportRes, {
        "employee submit report 200 or 400": (r) =>
          r.status === 200 || r.status === 201 || r.status === 400,
      });

      // 查自己的回報
      const myReportRes = http.get(
        `${BASE}/api/v1/events/${eventId}/reports/me`,
        { headers: authHeaders(token) },
      );
      check(myReportRes, { "employee get own report 200": (r) => r.status === 200 });
    }

    sleep(0.3);
  });

  // ── 情境 D：查看通知（所有角色皆可）
  group("notifications", function () {
    const token = login(EMP_EMAIL, EMP_PASS);
    if (!token) return;

    const notifRes = http.get(`${BASE}/api/v1/notifications`, {
      headers: authHeaders(token),
    });
    check(notifRes, { "list notifications 200": (r) => r.status === 200 });

    sleep(0.2);
  });
}
