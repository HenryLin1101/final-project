/**
 * Playwright E2E 測試 — 登入頁面
 *
 * 前置條件（執行前需確認）：
 *   1. 完整 stack 已啟動：docker compose up --build 或 pnpm dev
 *   2. DB 已 seed：pnpm --filter api exec prisma db seed
 *   3. 前端預設跑在 http://localhost:3001（pnpm dev:web）
 *      或透過 Nginx 在 http://localhost（docker compose）
 *
 * 執行：
 *   pnpm --filter web exec playwright test e2e/login.spec.ts
 *   # 帶自訂 base URL（完整 stack via Nginx）：
 *   PLAYWRIGHT_BASE_URL=http://localhost pnpm --filter web exec playwright test e2e/login.spec.ts
 */
import { test, expect } from "@playwright/test";

const VALID_EMAIL = "employee1@demo.com";
const VALID_PASSWORD = "Password123!";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/zh-TW/login");
    await expect(page).toHaveURL(/\/zh-TW\/login/);
  });

  test("shows login form with email and password fields", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "登入" })).toBeVisible();
  });

  test("shows error alert on wrong password", async ({ page }) => {
    await page.locator("#email").fill(VALID_EMAIL);
    await page.locator("#password").fill("WrongPassword999!");
    await page.getByRole("button", { name: "登入" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 8_000 });
    await expect(alert).not.toBeEmpty();
  });

  test("shows error alert on non-existent email", async ({ page }) => {
    await page.locator("#email").fill("nobody@example.com");
    await page.locator("#password").fill("Password123!");
    await page.getByRole("button", { name: "登入" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 8_000 });
  });

  test("redirects to /dashboard after successful login", async ({ page }) => {
    await page.locator("#email").fill(VALID_EMAIL);
    await page.locator("#password").fill(VALID_PASSWORD);
    await page.getByRole("button", { name: "登入" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });
});
