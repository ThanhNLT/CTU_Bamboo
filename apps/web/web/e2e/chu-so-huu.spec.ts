// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
// Tài khoản chủ sở hữu đã cài xong OTP thì không đăng nhập tự động được: chỉ chạy khi chỉ định tài khoản thử
const OWNER = process.env.E2E_OWNER_USER ?? "";
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? PASSWORD;
const STAMP = Date.now().toString().slice(-5);

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
}

test("trang khôi phục tài khoản chủ sở hữu báo lỗi rõ khi không lập được đơn", async ({ page }) => {
  await page.goto("/khoi-phuc");
  await expect(page.getByText("Khôi phục tài khoản chủ sở hữu")).toBeVisible();
  await page.getByLabel("Mã số thuế của công ty").fill("0109999999");
  await page.getByRole("button", { name: "Lập đơn khôi phục" }).click();
  await expect(page.getByText(/Không có công ty nào có chủ sở hữu|chưa cài chứng thư gốc/)).toBeVisible();
});

test("chủ sở hữu tạo công ty thành viên và mở hộp thoại chuyển quyền", async ({ page }) => {
  test.skip(!OWNER, "Cần E2E_OWNER_USER là chủ sở hữu một công ty");
  await login(page, OWNER, OWNER_PASSWORD);
  await page.goto("/admin/company");
  await expect(page.getByText("Bạn là chủ sở hữu của công ty.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Tạo công ty thành viên" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mã công ty").fill(`tv${STAMP}`);
  await dialog.getByLabel("Tên hiển thị").fill(`Thành viên ${STAMP}`);
  await dialog.getByLabel("Họ tên").fill("Lê Thử Nghiệm");
  await dialog.getByLabel("Tên đăng nhập").fill(`tv.${STAMP}`);
  await dialog.getByRole("button", { name: "Tạo công ty" }).click();
  await expect(page.locator(".ant-modal-confirm-title")).toContainText(`Đã tạo công ty thành viên Thành viên ${STAMP}`);
  await expect(page.getByText("chỉ hiện một lần", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();

  await page.getByRole("combobox").click();
  await page.locator(".ant-select-item-option").first().click();
  await page.getByRole("button", { name: "Chuyển quyền" }).click();
  await expect(page.locator(".ant-modal-confirm-title")).toContainText("Chuyển quyền chủ sở hữu cho");
  await page.getByRole("button", { name: "Hủy" }).click();
});
