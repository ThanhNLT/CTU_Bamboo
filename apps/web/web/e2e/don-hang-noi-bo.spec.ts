// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const TITLE = `E2E PMIC nội bộ ${Date.now()}`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
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
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
}

test("đặt hàng nội bộ, bên bán xác nhận kèm lô, bên mua có đơn mua", async ({ page }) => {
  test.setTimeout(180_000);

  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  await page.getByLabel("Nhà cung cấp đề xuất").click();
  await page.locator(".ant-select-item-option", { hasText: "Công ty Chip X (nội bộ)" }).click();
  const row = page.locator("tr.ant-table-row").first();
  await row.locator(".ant-select").click();
  await page.locator(".ant-select-item-option", { hasText: "LK-PMIC" }).click();
  await row.locator("input").nth(3).fill("100");
  await expect(page.getByText(/Tổng cộng:.*1\.200\.000/)).toBeVisible();
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.getByText("Nội bộ", { exact: true })).toBeVisible();
  const request = page.url();
  await logout(page);

  await login(page, "tp.muahang.dienthoai");
  await page.goto("/p/inbox");
  await page.locator("tr", { hasText: TITLE }).getByRole("button", { name: "Xử lý" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText(/Đã ghi nhận/)).toBeVisible();
  await page.goto(request);
  await expect(page.getByText("Chờ xác nhận")).toBeVisible();
  const docNo = (await page.getByText(/^IC-\d{4}-\d{6}$/).innerText()).trim();
  await logout(page);

  await login(page, "kd.chip");
  await expect(page.locator("header").getByRole("button", { name: /^[1-9]\d* thông báo chưa đọc$/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Đơn hàng nội bộ").click();
  await page.getByText("Chờ tôi xác nhận").click();
  await page.locator("tr", { hasText: docNo }).getByRole("button").click();
  await expect(page.getByText("Công ty Điện thoại X").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Lô dòng 1" }).click();
  await page.locator(".ant-select-item-option", { hasText: "PMIC-2609-A" }).click();
  await page.getByRole("button", { name: "Xác nhận và xuất lô" }).click();
  await expect(page.getByText(`Đã xác nhận ${docNo}`)).toBeVisible();
  await expect(page.getByText("Đã xác nhận").first()).toBeVisible();
  await expect(page.getByText("PMIC-2609-A").first()).toBeVisible();
  await logout(page);

  await login(page, "nv.muahang.dienthoai");
  await page.goto(request);
  await page.getByText(docNo).click();
  await expect(page.getByText(/^PO-\d{4}-\d{6}$/)).toBeVisible();
  await expect(page.getByText("PMIC-2609-A").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hủy đơn" })).toHaveCount(0);
});
