/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("CDO xem tập dữ liệu Lakehouse và dữ liệu mẫu đã che", async ({ page }) => {
  await login(page, "cdo");
  await page.goto("/d/services");
  await expect(page.getByRole("heading", { name: "Dịch vụ dữ liệu" })).toBeVisible();

  const list = page.getByRole("list", { name: "Tập dữ liệu" });
  await expect(list.getByRole("button", { name: /^Đề nghị mua sắm/ })).toBeVisible({ timeout: 30_000 });
  await expect(list.getByText("lakehouse.silver.core_permission")).toHaveCount(0);

  await page
    .getByRole("group", { name: "Lĩnh vực" })
    .getByRole("button", { name: /^Mua sắm/ })
    .click();
  await list.getByRole("button", { name: /^Đề nghị mua sắm/ }).click();
  const detail = page.locator("article");
  await expect(detail.getByRole("heading", { name: "Đề nghị mua sắm" })).toBeVisible();
  await expect(detail.getByText("lakehouse.silver.proc_purchase_request")).toBeVisible();
  await expect(detail.getByRole("cell", { name: "total_amount" })).toBeVisible();

  await expect(detail.getByText(/^\d[\d.]*$/).first()).toBeVisible({ timeout: 60_000 });
  await detail.getByRole("tab", { name: "Dữ liệu mẫu" }).click();
  await expect(detail.getByText(/dòng thay đổi gần nhất của công ty đang chọn/)).toBeVisible({ timeout: 60_000 });
  await expect(detail.getByRole("columnheader", { name: "doc_no" })).toBeVisible();
  await expect(detail.locator("tbody tr").first()).toContainText("PR-");

  await detail.getByRole("tab", { name: "Cách dùng" }).click();
  await expect(detail.getByText(/FROM lakehouse\.silver\.proc_purchase_request/)).toBeVisible();
});

test("nhân viên không có quyền data.lakehouse.read bị chặn", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/d/services");
  await expect(page.getByText("Bạn chưa có quyền xem dữ liệu Lakehouse")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("list", { name: "Tập dữ liệu" })).toHaveCount(0);
});
