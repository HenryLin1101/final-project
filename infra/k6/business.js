/**
 * k6 業務情境負載測試 — 對齊目前前端三角色流程
 *
 * ADMIN:  /dashboard → /admin/events → /events/:id（全公司 stats + reports，不回報）
 * MANAGER: /dashboard → /events → /events/:id（stats + 自己的回報 + 轄下 reports/team）
 * EMPLOYEE: /dashboard → /events → /events/:id（僅 reports/me，可提交回報）
 *
 * 執行（需完整 stack 或 GKE API）：
 *   BASE_URL=http://<api-ip> k6 run infra/k6/business.js
 *
 * 帳密可覆寫（預設為 seed）：
 *   ADMIN_EMAIL=admin@demo.com MANAGER_EMAIL=manager@demo.com EMP_EMAIL=employee1@demo.com
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const loginErrors = new Rate("login_error_rate");
const reportSubmitDuration = new Trend("report_submit_duration", true);
const reportsAccepted = new Counter("reports_accepted_202");

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 10 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    // 讀取請求與 submit 分開評估（submit 可能因 10 req/min 偶發 429）
    "http_req_failed{load:read}": ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
    report_submit_duration: ["p(95)<1000"],
    login_error_rate: ["rate<0.01"],
    reports_accepted_202: ["count>=1"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost";
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || "admin@demo.com";
const ADMIN_PASS = __ENV.ADMIN_PASS || "Password123!";
const MANAGER_EMAIL = __ENV.MANAGER_EMAIL || "manager@demo.com";
const MANAGER_PASS = __ENV.MANAGER_PASS || "Password123!";
const EMP_EMAIL = __ENV.EMP_EMAIL || "employee1@demo.com";
const EMP_PASS = __ENV.EMP_PASS || "Password123!";

const JSON_HEADERS = { "Content-Type": "application/json" };

function loginOnce(email, password) {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS, tags: { name: "login" } },
  );
  const ok = check(res, {
    "login 201": (r) => r.status === 201,
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

function parseEvents(body) {
  try {
    const data = JSON.parse(body);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function firstActiveEvent(events) {
  return events.find((e) => e.status === "ACTIVE") || null;
}

/** 各角色 token 在 setup 取得一次，避免每輪反覆登入觸發 5 req/min 限制 */
export function setup() {
  const adminToken = loginOnce(ADMIN_EMAIL, ADMIN_PASS);
  const managerToken = loginOnce(MANAGER_EMAIL, MANAGER_PASS);
  const employeeToken = loginOnce(EMP_EMAIL, EMP_PASS);
  if (!adminToken || !managerToken || !employeeToken) {
    throw new Error("setup login failed — check BASE_URL and seed accounts");
  }
  return { adminToken, managerToken, employeeToken };
}

export default function (data) {
  group("health_check", function () {
    const res = http.get(`${BASE}/health`, { tags: { name: "health", load: "read" } });
    check(res, { "health 200": (r) => r.status === 200 });
    sleep(0.1);
  });

  // ADMIN：/admin/events 列表 → 事件詳情（stats + 全公司 reports）
  group("admin_workflow", function () {
    const token = data.adminToken;
    const headers = authHeaders(token);

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "admin me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "admin list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) {
      sleep(0.3);
      return;
    }

    const detailRes = http.get(`${BASE}/api/v1/events/${active.id}`, {
      headers,
      tags: { name: "event_detail", load: "read" },
    });
    check(detailRes, { "admin event detail 200": (r) => r.status === 200 });

    const statsRes = http.get(`${BASE}/api/v1/events/${active.id}/stats`, {
      headers,
      tags: { name: "event_stats", load: "read" },
    });
    check(statsRes, { "admin stats 200": (r) => r.status === 200 });

    const allReportsRes = http.get(`${BASE}/api/v1/events/${active.id}/reports`, {
      headers,
      tags: { name: "admin_all_reports", load: "read" },
    });
    check(allReportsRes, { "admin all reports 200": (r) => r.status === 200 });

    sleep(0.3);
  });

  // MANAGER：事件詳情（stats + 自己的回報 + 轄下 direct reports）
  group("manager_workflow", function () {
    const token = data.managerToken;
    const headers = authHeaders(token);

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "manager me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "manager list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) {
      sleep(0.3);
      return;
    }

    const statsRes = http.get(`${BASE}/api/v1/events/${active.id}/stats`, {
      headers,
      tags: { name: "event_stats", load: "read" },
    });
    check(statsRes, { "manager stats 200": (r) => r.status === 200 });

    const myReportRes = http.get(`${BASE}/api/v1/events/${active.id}/reports/me`, {
      headers,
      tags: { name: "my_report", load: "read" },
    });
    check(myReportRes, { "manager my report 200": (r) => r.status === 200 });

    const teamRes = http.get(`${BASE}/api/v1/events/${active.id}/reports/team`, {
      headers,
      tags: { name: "team_reports", load: "read" },
    });
    check(teamRes, { "manager team reports 200": (r) => r.status === 200 });

    sleep(0.3);
  });

  // EMPLOYEE：事件詳情（僅自己的回報，不含 stats / team）
  group("employee_workflow", function () {
    const token = data.employeeToken;
    const headers = authHeaders(token);

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "employee me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "employee list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) {
      sleep(0.3);
      return;
    }

    const myReportRes = http.get(`${BASE}/api/v1/events/${active.id}/reports/me`, {
      headers,
      tags: { name: "my_report", load: "read" },
    });
    check(myReportRes, { "employee my report 200": (r) => r.status === 200 });

    // 回報 API 限 10 req/min/IP；業務測試以讀取為主，低機率抽樣提交（大量提交請用 safety-report-burst.js）
    if (Math.random() < 0.08) {
      const status = Math.random() > 0.2 ? "SAFE" : "NEED_HELP";
      const start = Date.now();
      const reportRes = http.post(
        `${BASE}/api/v1/events/${active.id}/reports`,
        JSON.stringify({ status }),
        { headers, tags: { name: "submit_report" } },
      );
      reportSubmitDuration.add(Date.now() - start);

      const accepted = check(reportRes, {
        "employee submit 202": (r) => r.status === 202,
        "employee submit has jobId": (r) => {
          try {
            return !!JSON.parse(r.body).jobId;
          } catch {
            return false;
          }
        },
      });
      if (accepted) reportsAccepted.add(1);
    }

    sleep(0.3);
  });

  // 所有角色：通知列表（Dashboard 未讀數）
  group("notifications", function () {
    const token = data.employeeToken;
    const headers = authHeaders(token);

    const notifRes = http.get(`${BASE}/api/v1/notifications`, {
      headers,
      tags: { name: "notifications", load: "read" },
    });
    check(notifRes, { "list notifications 200": (r) => r.status === 200 });

    sleep(0.2);
  });
}
