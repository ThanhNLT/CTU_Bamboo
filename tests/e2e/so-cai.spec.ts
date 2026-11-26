/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
const TITLE = `E2E sổ cái ${STAMP}`;
const FILE = `bien-ban-${STAMP}.txt`;
const CONTENT = Buffer.from(`Biên bản bàn giao ${STAMP}\nTệp kiểm thử Sổ cái.\n`);

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("đối soát tệp theo số chứng từ và theo tệp, mở hồ sơ lưu trữ ở phòng đọc", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");

  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Bàn giao thiết bị");
  await row.locator("input").nth(2).fill("bộ");
  await row.locator("input").nth(3).fill("1");
  await row.locator("input").nth(4).fill("100000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp")).toBeVisible();
  await expect(page).toHaveURL(/\/p\/documents\/show\//);
  const id = page.url().split("/").pop();
  const docNo =
    (
      await page
        .getByText(/^PR-\d{4}-\d{6}$/)
        .first()
        .textContent()
    )?.trim() ?? "";
  expect(docNo).toMatch(/^PR-/);

  await page.goto(`/h/drive?folder=${id}`);
  await expect(
    page.getByRole("navigation", { name: "Đường dẫn thư mục" }).getByText(TITLE, { exact: false }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: FILE, mimeType: "text/plain", buffer: CONTENT });
  await expect(page.getByLabel("Tiến trình tải lên").getByText("Đã quét sạch · đã lưu")).toBeVisible();

  await page.goto(`/d/ledger?doc=${docNo}`);
  const result = page.getByRole("region", { name: "Kết quả đối soát" });
  await expect(result.getByText("Khớp với bản niêm phong")).toBeVisible();
  await expect(result.getByText(FILE)).toBeVisible();
  await expect(page.getByRole("region", { name: "Niêm phong gần đây" }).getByText(docNo).first()).toBeVisible();

  await page.getByRole("button", { name: "Tải tệp lên" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "ban-sao.txt", mimeType: "text/plain", buffer: CONTENT });
  await expect(result.getByText("Khớp với bản niêm phong")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "ban-da-sua.txt",
    mimeType: "text/plain",
    buffer: Buffer.concat([CONTENT, Buffer.from("x")]),
  });
  await expect(result.getByText("Không tìm thấy bản niêm phong")).toBeVisible();

  await page.goto(`/p/documents/show/${id}`);
  await page.getByRole("button", { name: "Hủy" }).click();
  await page.getByPlaceholder("Lý do hủy (bắt buộc)").fill("Kiểm thử Sổ cái");
  await page.getByRole("button", { name: "Hủy đề nghị" }).click();
  await expect(page.getByText("Đã hủy").first()).toBeVisible();

  await page.goto("/d/ledger");
  await page.getByRole("tab", { name: /Phòng đọc/ }).click();
  await page.getByPlaceholder("Tìm theo tên, mã lưu trữ, năm").fill(docNo);
  await page.getByRole("button", { name: new RegExp(`Mở chỉ đọc: .*${TITLE}`) }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText("Chỉ đọc")).toBeVisible();
  await expect(viewer.getByText("Tệp kiểm thử Sổ cái.")).toBeVisible();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("region", { name: "Nhật ký truy cập" }).getByText(TITLE).first()).toBeVisible();
});
