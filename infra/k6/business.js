/**
 * k6 業務情境負載測試 — 67 VU，對齊三角色前端流程
 *
 * ADMIN:    /admin/events → /events/:id（stats + 全公司 reports，不回報）
 * MANAGER:  /events/:id（stats + reports/me + reports/team 直屬下屬）
 * EMPLOYEE: /events/:id（reports/me + 每 VU 各自提交回報 → 202）
 *
 * 執行（需 GKE API + 帳號已 seed:loadtest + tokens 已產生）：
 *   docker run --rm \
 *     -v "$PWD/infra/k6:/scripts" \
 *     -e BASE_URL=http://34.84.115.96 \
 *     -e TOKENS_FILE=/scripts/load-test-tokens-business.json \
 *     grafana/k6 run /scripts/business.js
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { parseTokens, tokenForVu, bearerHeader } from "./lib/accounts.js";

const loginErrors = new Rate("login_error_rate");
const reportSubmitDuration = new Trend("report_submit_duration", true);
const reportsAccepted = new Counter("reports_accepted_202");

export const options = {
  stages: [
    { duration: "30s", target: 67 },
    { duration: "1m",  target: 67 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    "http_req_failed{load:read}": ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
    report_submit_duration: ["p(95)<1000"],
    login_error_rate: ["rate<0.01"],
    reports_accepted_202: ["count>=50"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost";
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || "admin@demo.com";
const ADMIN_PASS = __ENV.ADMIN_PASS || "Password123!";
const MANAGER_EMAIL = __ENV.MANAGER_EMAIL || "manager@demo.com";
const MANAGER_PASS = __ENV.MANAGER_PASS || "Password123!";
const TOKENS_FILE = __ENV.TOKENS_FILE || "/scripts/load-test-tokens-business.json";

// open() must be called in the init stage (global scope), not inside setup()
const _rawEmployeeTokens = open(TOKENS_FILE);

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

/** setup: admin/manager 用 HTTP login（各 1 次）；employee tokens 從 init 階段讀取的字串 parse */
export function setup() {
  const adminToken = loginOnce(ADMIN_EMAIL, ADMIN_PASS);
  const managerToken = loginOnce(MANAGER_EMAIL, MANAGER_PASS);
  if (!adminToken || !managerToken) {
    throw new Error("setup login failed — check BASE_URL and seed accounts");
  }
  const employeeTokens = parseTokens(_rawEmployeeTokens);
  console.log(`Loaded ${employeeTokens.length} employee tokens for 67 VUs.`);
  return { adminToken, managerToken, employeeTokens };
}

export default function (data) {
  group("health_check", function () {
    const res = http.get(`${BASE}/health`, { tags: { name: "health", load: "read" } });
    check(res, { "health 200": (r) => r.status === 200 });
    sleep(0.1);
  });

  // ADMIN：列事件 → 事件詳情（全公司 stats + reports）
  group("admin_workflow", function () {
    const token = data.adminToken;
    const headers = authHeaders(token);

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "admin me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "admin list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) { sleep(0.3); return; }

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

  // MANAGER：stats + reports/me + reports/team（直屬下屬）
  group("manager_workflow", function () {
    const token = data.managerToken;
    const headers = authHeaders(token);

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "manager me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "manager list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) { sleep(0.3); return; }

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

  // EMPLOYEE：每 VU 持有唯一 loadtest 帳號，各自讀取 + 提交回報
  group("employee_workflow", function () {
    const account = tokenForVu(data.employeeTokens, __VU);
    const headers = {
      Authorization: bearerHeader(account),
      "Content-Type": "application/json",
    };

    const meRes = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { name: "auth_me", load: "read" } });
    check(meRes, { "employee me 200": (r) => r.status === 200 });

    const eventsRes = http.get(`${BASE}/api/v1/events`, { headers, tags: { name: "list_events", load: "read" } });
    check(eventsRes, { "employee list events 200": (r) => r.status === 200 });

    const active = firstActiveEvent(parseEvents(eventsRes.body));
    if (!active) { sleep(0.3); return; }

    const myReportRes = http.get(`${BASE}/api/v1/events/${active.id}/reports/me`, {
      headers,
      tags: { name: "my_report", load: "read" },
    });
    check(myReportRes, { "employee my report 200": (r) => r.status === 200 });

    // 每 VU 擁有唯一 user token，10 req/min per user 限制各自獨立
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

    sleep(0.3);
  });

  // 通知（Dashboard 未讀數）
  group("notifications", function () {
    const account = tokenForVu(data.employeeTokens, __VU);
    const headers = {
      Authorization: bearerHeader(account),
      "Content-Type": "application/json",
    };

    const notifRes = http.get(`${BASE}/api/v1/notifications`, {
      headers,
      tags: { name: "notifications", load: "read" },
    });
    check(notifRes, { "list notifications 200": (r) => r.status === 200 });

    sleep(0.2);
  });
}
