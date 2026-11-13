/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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
const TITLE = `E2E ổ đĩa ${Date.now()}`;
const FILE = `bao-gia-${Date.now()}.pdf`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("tải tệp vào chứng từ qua Ổ đĩa, xem số liệu điều hành", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Màn hình 6.5 inch");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("5");
  await row.locator("input").nth(4).fill("300000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp")).toBeVisible();
  await expect(page).toHaveURL(/\/p\/documents\/show\//);
  const id = page.url().split("/").pop();

  await page.goto(`/h/drive?folder=${id}`);
  await expect(
    page.getByRole("navigation", { name: "Đường dẫn thư mục" }).getByText(TITLE, { exact: false }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: FILE,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nbao gia o dia\n%%EOF\n"),
  });
  await expect(page.getByLabel("Tiến trình tải lên").getByText("Đã quét sạch · đã lưu")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(FILE) }).getByText("Sạch")).toBeVisible();

  await page.getByRole("navigation", { name: "Vùng lưu trữ" }).getByText("Tệp tôi tải lên").click();
  await expect(page.getByRole("button", { name: new RegExp(TITLE) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(FILE) })).toBeVisible();

  await page.goto("/d/ops");
  await expect(page.getByRole("region", { name: "Hồ sơ chờ duyệt" }).getByText(/^\d+$/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Hồ sơ đang chờ theo công ty" }).getByText("Điện thoại X").first(),
  ).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa")).toHaveCount(0);
});
