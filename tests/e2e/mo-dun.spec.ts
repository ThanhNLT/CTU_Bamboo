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

async function login(page: Page, username: string, tenant: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText(tenant).first()).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Điều hướng chính" });

test("quản trị viên tắt rồi bật lại một chức năng, menu và trang đổi theo", async ({ page }) => {
  await login(page, "tp.khth.benhvien", "Bệnh viện X");
  await page.goto("/admin/modules");
  await expect(page.getByRole("heading", { name: "Quản lý chức năng" })).toBeVisible();
  await expect(card(page, "Sổ cái").getByText("Đang bật")).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toBeVisible();

  await card(page, "Phê duyệt").getByRole("button", { name: "Tắt" }).click();
  await page.getByRole("button", { name: "Tắt", exact: true }).last().click();
  await expect(page.getByText(/Không tắt được Phê duyệt: mô-đun .* đang bật và dựa vào nó/)).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();

  await card(page, "Sổ cái").getByRole("button", { name: "Tắt" }).click();
  await page.getByRole("button", { name: "Tắt", exact: true }).last().click();
  await expect(page.getByText(/Đã tắt Sổ cái/)).toBeVisible();
  await expect(card(page, "Sổ cái").getByText("Chưa bật")).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toHaveCount(0);

  await page.goto("/d/ledger");
  await expect(page.getByText("Chức năng Sổ cái chưa được bật")).toBeVisible();
  await expect(page.getByText(/Không tải được/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mở Quản lý chức năng" }).click();

  await card(page, "Sổ cái").getByRole("button", { name: "Bật" }).click();
  await page.getByRole("button", { name: "Bật", exact: true }).last().click();
  await expect(page.getByText(/Đã bật Sổ cái/)).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toBeVisible();
  await page.goto("/d/ledger");
  await expect(page.getByText("Chức năng Sổ cái chưa được bật")).toHaveCount(0);
});

test("người không có quyền không thấy trang quản lý chức năng", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai", "Tập đoàn X");
  await expect(nav(page).getByText("Quản lý chức năng")).toHaveCount(0);
  await page.goto("/admin/modules");
  await expect(page.getByText("Bạn chưa có quyền quản trị mục này.")).toBeVisible();
});
