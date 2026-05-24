/**
 * Playwright E2E 測試 — 安全回報頁面
 *
 * 前置條件（執行前需確認）：
 *   1. 完整 stack 已啟動：docker compose up --build 或 pnpm dev
 *   2. DB 已 seed（含至少一個 ACTIVE 事件）
 *   3. 前端預設跑在 http://localhost:3001（pnpm dev:web）
 *      或 http://localhost（docker compose via Nginx）
 *
 * 執行：
 *   pnpm --filter web exec playwright test e2e/report.spec.ts
 */
import { test, expect } from "@playwright/test";

const EMP_EMAIL = "employee1@demo.com";
const EMP_PASSWORD = "Password123!";
const ADMIN_EMAIL = "admin@demo.com";
const ADMIN_PASSWORD = "Password123!";

/** 共用登入 helper：填寫表單並等待跳轉至 dashboard */
async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/zh-TW/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe("Safety report flow (employee)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, EMP_EMAIL, EMP_PASSWORD);
  });

  test("can navigate from dashboard to events list", async ({ page }) => {
    await page.goto("/zh-TW/events");
    await expect(page).toHaveURL(/\/events/);
    await expect(page.getByRole("heading", { name: "事件列表" })).toBeVisible({ timeout: 8_000 });
  });

  test("report page shows SAFE and NEED_HELP selection cards", async ({ page }) => {
    await page.goto("/zh-TW/events");

    const eventRows = page.locator("table tbody tr");
    const count = await eventRows.count();
    test.skip(count === 0, "No events in DB — skip report test");

    await eventRows.first().click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/, { timeout: 8_000 });

    const reportBtn = page.getByRole("link", { name: "安全回報" });
    await expect(reportBtn).toBeVisible({ timeout: 5_000 });
    await reportBtn.click();

    await expect(page).toHaveURL(/\/report$/, { timeout: 8_000 });
    await expect(page.getByText("安全")).toBeVisible();
    await expect(page.getByText("需要協助")).toBeVisible();
  });

  test("can select SAFE card and submit report", async ({ page }) => {
    await page.goto("/zh-TW/events");

    const eventRows = page.locator("table tbody tr");
    const count = await eventRows.count();
    test.skip(count === 0, "No events in DB — skip report submit test");

    await eventRows.first().click();
    const reportBtn = page.getByRole("link", { name: "安全回報" });
    await expect(reportBtn).toBeVisible({ timeout: 5_000 });
    await reportBtn.click();
    await expect(page).toHaveURL(/\/report$/, { timeout: 8_000 });

    await page.getByText("安全").click();

    const submitBtn = page.getByRole("button", { name: "送出回報" });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 成功後應跳回事件詳情頁
    await expect(page).toHaveURL(/\/events\/[^/]+$/, { timeout: 10_000 });
  });
});

test.describe("Report page access control", () => {
  test("unauthenticated user is redirected to login when accessing report page", async ({ page }) => {
    await page.goto("/zh-TW/events/dummy-id/report");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("admin user does not see report button on event detail (ADMIN cannot submit reports)", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/zh-TW/events");

    const eventRows = page.locator("table tbody tr");
    const count = await eventRows.count();
    test.skip(count === 0, "No events in DB — skip admin report button test");

    await eventRows.first().click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/, { timeout: 8_000 });

    const reportBtn = page.getByRole("link", { name: "安全回報" });
    await expect(reportBtn).not.toBeVisible({ timeout: 3_000 });
  });
});
