// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

// Chỉ chạy được trên máy chủ chưa có công ty nào (SEED_DEMO=false); E2E_SETUP_CODE là mã in ở log bootstrap
const SETUP_URL = process.env.E2E_SETUP_URL ?? "http://localhost:8000/setup";
const CODE = process.env.E2E_SETUP_CODE ?? "";
const STAMP = Date.now().toString().slice(-6);

test("khởi tạo công ty lần đầu: mã thiết lập, đơn đăng ký, tạo công ty chưa xác thực", async ({ page, request }) => {
  const status = await request
    .get(`${SETUP_URL}/status`)
    .then((r) => r.json())
    .catch(() => ({ open: false }));
  test.skip(!status.open || !CODE, "Máy chủ đã có công ty hoặc chưa cho mã thiết lập (E2E_SETUP_CODE)");

  await page.goto("/login");
  await expect(page.getByText("Hệ thống chưa có công ty nào.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập bằng tài khoản đã có" })).toBeVisible();
  await page.getByRole("button", { name: "Tạo công ty mới" }).click();
  await expect(page).toHaveURL(/\/khoi-tao$/);

  await page.getByLabel("Mã thiết lập").fill("SAI0-SAI0-SAI0");
  await page.getByLabel("Tên doanh nghiệp").fill("Công ty Cổ phần Thử nghiệm E2E");
  await page.getByLabel("Mã số thuế").fill(`0109${STAMP}`);
  await page.getByLabel("Mã công ty trên hệ thống").fill(`e2e${STAMP}`);
  await page.getByLabel("Địa chỉ trụ sở chính").fill("Số 1 Tràng Tiền, Hà Nội");
  await page.getByLabel("Người đại diện theo pháp luật").fill("Nguyễn Văn Thử");
  await page.getByLabel("Tên đăng nhập").fill(`chu.${STAMP}`);
  await page.getByRole("button", { name: "Lập đơn đăng ký" }).click();
  await expect(page.getByText("Mã thiết lập không đúng")).toBeVisible();

  await page.getByLabel("Mã thiết lập").fill(CODE);
  await page.getByRole("button", { name: "Lập đơn đăng ký" }).click();
  await expect(page.getByText(/Mã đơn/)).toBeVisible();
  const pdf = await request.get(
    (await page.getByRole("link", { name: "Tải đơn đăng ký (PDF)" }).getAttribute("href")) ?? "",
  );
  expect(pdf.ok()).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Chưa có chữ ký số: tạo công ty chưa xác thực" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tạo công ty", exact: true }).click();
  await expect(page.getByText("Đã tạo công ty")).toBeVisible();
  await expect(page.getByText(/Công ty chưa xác thực pháp lý/)).toBeVisible();
  await expect(page.getByRole("cell", { name: `chu.${STAMP}` })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Chủ sở hữu" })).toBeVisible();

  // trang khởi tạo đóng sau khi đã có công ty
  await page.goto("/khoi-tao");
  await expect(page.getByText("Hệ thống đã có công ty")).toBeVisible();
});

test("trang Thông tin công ty: công ty có từ trước chưa có chủ sở hữu", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill("cdo");
  await page.locator("#password").fill(process.env.DEMO_PASSWORD ?? "demo-password");
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Thông tin công ty").click();
  await expect(page.getByRole("heading", { name: "Thông tin công ty" })).toBeVisible();
  await expect(page.getByText(/chưa có chủ sở hữu; quyền quản trị trao theo cách cũ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Lập đơn xác thực" })).toHaveCount(0);
});
