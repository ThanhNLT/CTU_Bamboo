/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.locator("header").first()).toBeVisible();
}

test("Phó tổng giám đốc ban hành quyết định bổ nhiệm kiêm nhiệm", async ({ page }) => {
  await login(page, "pho.tgd");
  await page.goto("/h/decisions");
  await expect(page.getByRole("heading", { name: "Quyết định nhân sự" })).toBeVisible();
  await page.getByRole("button", { name: "Ban hành quyết định" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Bổ nhiệm", { exact: true }).click();
  await dialog.locator("div.ant-select[aria-label='Nhân sự']").click();
  await page.keyboard.type("Đỗ Thị Hương");
  await page.locator(".ant-select-item-option", { hasText: "Đỗ Thị Hương" }).first().click();
  await dialog.locator("div.ant-select[aria-label='Vị trí mới']").click();
  await page.keyboard.type("trống");
  await page.locator(".ant-select-item-option", { hasText: "trống" }).first().click();
  await dialog.getByLabel("Căn cứ / lý do").fill("Bổ sung nhân lực dự án");
  await dialog.getByRole("button", { name: "Ban hành" }).click();
  await expect(page.getByText(/Đã ban hành quyết định QD-\d{4}-\d{6}/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /^QD-\d{4}-\d{6}$/ }).first()).toBeVisible();
});

test("nhân viên không có nút ban hành quyết định", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/h/decisions");
  await expect(page.getByRole("heading", { name: "Quyết định nhân sự" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ban hành quyết định" })).toHaveCount(0);
});
