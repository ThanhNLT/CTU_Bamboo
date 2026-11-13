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
const STAMP = Date.now();
const TITLE = `E2E NCC mới ${STAMP}`;
const SUPPLIER = `Công ty E2E ${STAMP}`;
const TAX = `0${String(STAMP).slice(-9)}`;
const CODE = `NCC-E2E-${String(STAMP).slice(-6)}`;
const FILE = `bao-gia-ncc-${STAMP}.txt`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("CDO lập đề nghị với nhà cung cấp mới, thêm vào danh mục, tải báo giá từ Ổ đĩa", async ({ page }) => {
  await login(page, "cdo");

  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  await page.getByLabel("Nhà cung cấp đề xuất").fill(SUPPLIER);
  await page.getByText(`＋ Dùng nhà cung cấp mới “${SUPPLIER}”`).click();
  await page.getByLabel("Mã số thuế nhà cung cấp mới").fill(TAX);
  await page.getByLabel("Nhóm hàng").fill("CNTT");
  await page.locator(".ant-select-item-option[title='Thiết bị CNTT']").click();
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Máy chủ dự phòng");
  await row.locator("input").nth(2).fill("bộ");
  await row.locator("input").nth(3).fill("1");
  await row.locator("input").nth(4).fill("50000000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp")).toBeVisible();
  await expect(page).toHaveURL(/\/p\/documents\/show\//);
  await expect(page.getByText(`${SUPPLIER} · MST ${TAX}`)).toBeVisible();
  await expect(page.getByText("Chưa có trong danh mục")).toBeVisible();
  const docNo =
    (
      await page
        .getByText(/^PR-\d{4}-\d{6}$/)
        .first()
        .textContent()
    )?.trim() ?? "";

  await page.goto("/admin/catalog?tab=partner");
  const proposed = page.getByRole("region", { name: "Nhà cung cấp đề xuất" });
  await proposed.getByLabel(`Mã nhà cung cấp cho ${SUPPLIER}`).fill(CODE);
  await proposed
    .getByRole("listitem")
    .filter({ hasText: SUPPLIER })
    .getByRole("button", { name: "Thêm vào danh mục" })
    .click();
  await expect(page.getByText(`Đã thêm “${SUPPLIER}” vào danh mục nhà cung cấp.`)).toBeVisible();
  await expect(page.getByRole("cell", { name: CODE })).toBeVisible();

  await page.goto("/h/drive");
  await expect(page.getByText(/Còn khả dụng/)).toBeVisible();
  await page.getByRole("button", { name: "Tải lên", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Tải tệp vào chứng từ" });
  await picker.getByRole("combobox", { name: "Chứng từ nhận tệp" }).fill(docNo);
  await page.locator(".ant-select-item-option").filter({ hasText: docNo }).click();
  await picker.getByLabel("Tệp tải lên").setInputFiles({
    name: FILE,
    mimeType: "text/plain",
    buffer: Buffer.from(`Báo giá ${SUPPLIER}\n`),
  });
  await expect(page.getByLabel("Tiến trình tải lên").getByText("Đã quét sạch · đã lưu")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(FILE) })).toBeVisible();

  await page.goto("/p/documents");
  await page.getByPlaceholder("Tìm theo số hoặc tiêu đề").fill(docNo);
  await page.getByPlaceholder("Tìm theo số hoặc tiêu đề").press("Enter");
  await page
    .getByRole("row", { name: new RegExp(docNo) })
    .getByRole("button")
    .click();
  await expect(page.getByText(`${CODE} – ${SUPPLIER}`)).toBeVisible();
});
