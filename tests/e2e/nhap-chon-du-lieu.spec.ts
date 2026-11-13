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
const STAMP = Date.now().toString(36);

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("button", { name: /^Tài khoản:/ })).toBeVisible();
}

async function logout(page: Page) {
  const loggedOut = page.waitForResponse((r) => r.url().includes("/protocol/openid-connect/logout"));
  await page
    .locator("header")
    .getByRole("button", { name: /^Tài khoản:/ })
    .click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await loggedOut;
  await expect(page.locator("#username")).toBeVisible();
}

async function pick(page: Page, label: string, text: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.click({ force: true });
  if ((await box.getAttribute("readonly")) === null) await box.fill(text);
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: text }).first().click();
}

test("lưu nháp rồi sửa đề nghị mua sắm, lọc Hồ sơ", async ({ page }) => {
  const title = `E2E Sửa ${STAMP}`;
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(title);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Cáp USB-C");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("10");
  await row.locator("input").nth(4).fill("50000");
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp").last()).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole("button", { name: "Sửa" }).click();
  await expect(page.getByLabel("Tiêu đề")).toHaveValue(title);
  await page.getByLabel("Tiêu đề").fill(`${title} (đã sửa)`);
  await pick(page, "Nhóm hàng", "Dịch vụ");
  await pick(page, "Nhà cung cấp đề xuất", "NCC_MCB");
  await page.locator("tr.ant-table-row").first().locator("input").nth(3).fill("20");
  await expect(page.getByText(/Tổng cộng:.*1,000,000/)).toBeVisible();
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp").last()).toBeVisible();
  await expect(page.getByText(`${title} (đã sửa)`).first()).toBeVisible();
  await expect(page.getByText(/1,000,000/).first()).toBeVisible();

  await page.goto("/p/records");
  await page.getByRole("tab", { name: /^Nháp/ }).click();
  await pick(page, "Loại hồ sơ", "Đề nghị mua sắm");
  await expect(page.getByText(`${title} (đã sửa)`).first()).toBeVisible();
  await pick(page, "Loại hồ sơ", "Đơn hàng nội bộ");
  await expect(page.getByText(`${title} (đã sửa)`)).toHaveCount(0);
  await logout(page);
});

test("sửa rồi hủy đề xuất tài liệu; tìm kiếm trả thiết bị và tài sản dữ liệu thật", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/h/library");
  await page.getByRole("button", { name: "Đề xuất tài liệu" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Tên tài liệu").fill(`Hỏi đáp E2E ${STAMP}`);
  await form.getByRole("combobox", { name: "Loại" }).click({ force: true });
  await page.locator(".ant-select-item-option", { hasText: "Hỏi đáp" }).first().click();
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByRole("heading", { name: `Hỏi đáp E2E ${STAMP}` })).toBeVisible();

  await page.getByRole("button", { name: "Sửa" }).click();
  const edit = page.getByRole("dialog", { name: "Sửa đề xuất tài liệu" });
  await expect(edit.getByLabel("Tên tài liệu")).toHaveValue(`Hỏi đáp E2E ${STAMP}`);
  await edit.getByLabel("Tên tài liệu").fill(`Hỏi đáp E2E ${STAMP} v2`);
  await edit.getByLabel("Mục lục").fill("Câu 1\nCâu 2");
  await edit.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu đề xuất")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Hỏi đáp E2E ${STAMP} v2` })).toBeVisible();
  await expect(page.getByText("Câu 2").first()).toBeVisible();

  await page.getByRole("button", { name: "Hủy đề xuất" }).click();
  await page.getByPlaceholder("Lý do hủy (bắt buộc)").fill("Trùng tài liệu đã có");
  await page.getByRole("dialog").getByRole("button", { name: "Hủy đề xuất" }).click();
  await expect(page.getByText("Đã hủy").first()).toBeVisible();

  await page.goto("/i/search?q=CR-02");
  const results = page.getByRole("region", { name: /Kết quả/ }).or(page.locator("main"));
  await expect(results.getByText("Phòng sạch CR-02").first()).toBeVisible();
  await results.getByText("Phòng sạch CR-02").first().click();
  await expect(page).toHaveURL(/\/d\/twin\?entity=CR-02/);
  await page.goto("/i/search?q=wf_task");
  await expect(page.getByText("Việc duyệt (silver)").first()).toBeVisible();
  await page.goto("/i/search?q=máy bị nóng quá");
  await expect(page.getByText("Máy thở MT-HD-04")).toHaveCount(0);
});

test("quản trị: ngừng vị trí trống và nhập vị trí từ CSV", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "cdo");
  await page.goto("/admin/org");
  await page.getByPlaceholder("Tìm đơn vị theo tên, mã").fill("Chuyển đổi số");
  await page.getByRole("tree").getByText("Văn phòng Chuyển đổi số").click();

  await page.getByRole("button", { name: "Nhập từ Excel" }).click();
  await page.getByRole("menuitem", { name: "Nhập vị trí" }).click();
  const importer = page.getByRole("dialog", { name: "Nhập vị trí từ Excel" });
  const csv = (unit: string) =>
    Buffer.from(`Mã đơn vị,Tên vị trí\nTDX_CDS,Chuyên viên dữ liệu ${STAMP}\n${unit},Chuyên viên thử ${STAMP}\n`);
  await importer
    .locator('input[type="file"]')
    .setInputFiles({ name: "vi-tri.csv", mimeType: "text/csv", buffer: csv("KHONG_CO") });
  await expect(importer.getByText("1 / 2 dòng có lỗi")).toBeVisible();
  await importer.getByRole("button", { name: "Chọn tệp khác" }).click();
  await importer
    .locator('input[type="file"]')
    .setInputFiles({ name: "vi-tri.csv", mimeType: "text/csv", buffer: csv("TDX_CDS") });
  await expect(importer.getByText("2 dòng hợp lệ — sẵn sàng ghi.")).toBeVisible();
  await importer.getByRole("button", { name: "Ghi 2 dòng" }).click();
  await expect(page.getByText("Đã nhập 2 dòng vị trí.")).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(`Chuyên viên thử ${STAMP}`) }).first()).toBeVisible();

  const seat = page.getByRole("row", { name: new RegExp(`Chuyên viên thử ${STAMP}`) }).first();
  await seat.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Ngừng vị trí" }).click();
  await page.locator(".ant-modal:visible").getByRole("button", { name: /Ngừng/ }).click();
  await expect(page.getByText(/Đã ngừng vị trí/)).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(`Chuyên viên thử ${STAMP}`) })).toHaveCount(0);
});
