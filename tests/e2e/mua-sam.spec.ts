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

import { minimalPdf } from "./pdf";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const TITLE = `E2E mua linh kiện ${Date.now()}`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
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

test("lập đề nghị, đính kèm, gửi duyệt và duyệt", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Tụ điện 10uF");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("2000");
  await row.locator("input").nth(4).fill("1500");
  await expect(page.getByText(/Tổng cộng:.*3,000,000/)).toBeVisible();
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();

  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.locator(".ant-page-header-heading-title, .ant-space").getByText("Chờ duyệt").first()).toBeVisible();
  await expect(page.getByText(/Trưởng phòng/).first()).toBeVisible();
  const url = page.url();

  await page.locator('input[type="file"]').setInputFiles({
    name: "bao-gia.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf("bao gia"),
  });
  await expect(page.getByText("Sạch")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "virus.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("MZ\x90\x00 not a pdf"),
  });
  await expect(page.getByText("Bị loại – đã xóa")).toBeVisible();

  await page.getByRole("tab", { name: /Trao đổi/ }).click();
  await page.getByPlaceholder(/Trao đổi với/).fill("Nhờ anh/chị duyệt sớm giúp em.");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Nhờ anh/chị duyệt sớm giúp em.")).toBeVisible();
  await logout(page);

  await login(page, "tp.muahang.dienthoai");
  await expect(page.locator("header").getByRole("button", { name: /^[1-9]\d* thông báo chưa đọc$/ })).toBeVisible();
  await page.goto("/p/inbox");
  const task = page.locator("tr", { hasText: TITLE });
  await task.getByRole("button", { name: "Xử lý" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText(/Đã ghi nhận/)).toBeVisible();
  await expect(page.locator("tr", { hasText: TITLE })).toHaveCount(0);

  await page.goto(url);
  await expect(page.getByText("Đã duyệt").first()).toBeVisible();
  await expect(page.getByText("Hoàn tất duyệt")).toBeVisible();
});

test("một tài khoản hai tenant: chọn tenant, không thấy dữ liệu tenant kia", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill("kiemnhiem");
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
  await page.getByRole("button", { name: /Bệnh viện X/ }).click();
  await expect(page.locator("header").getByText("Bệnh viện X")).toBeVisible();
  await page.goto("/p/documents");
  await expect(page.locator(".ant-table-placeholder, tr.ant-table-row").first()).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await expect(page.getByText("Linh kiện thay thế cho lô điện thoại bị ảnh hưởng")).toHaveCount(0);
});

test("kiểm toán viên đối soát chuỗi hash nhật ký", async ({ page }) => {
  await login(page, "gd.taichinh");
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Kiểm toán").click();
  await expect(page.locator("tr.ant-table-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Đối soát chuỗi hash" }).click();
  await expect(page.getByText(/Chuỗi nguyên vẹn: \d+ bản ghi/)).toBeVisible();
});

test("nhân viên không thấy menu nhật ký kiểm toán", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Đề nghị mua sắm")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Kiểm toán")).toHaveCount(0);
});
