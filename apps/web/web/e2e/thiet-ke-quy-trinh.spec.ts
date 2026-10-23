// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

// Sơ đồ BPMN tạm ẩn khỏi giao diện (backend thiết kế quy trình vẫn giữ nguyên, xem ADR #47)
test("trang Thiết kế quy trình báo sẽ được cập nhật sau", async ({ page }) => {
  await login(page, "cdo");
  await page.goto("/p/process");
  await expect(page.getByRole("heading", { name: "Thiết kế quy trình" })).toBeVisible();
  await expect(page.getByText("Sẽ được cập nhật chức năng sau")).toBeVisible();
  await expect(page.locator(".djs-container")).toHaveCount(0);
});
