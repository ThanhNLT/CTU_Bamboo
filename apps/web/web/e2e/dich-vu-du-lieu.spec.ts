// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dịch vụ dữ liệu (ADR #45): CDO (vai trò Phân tích dữ liệu) xem danh mục tập dữ liệu Lakehouse thật và dữ liệu mẫu
// của Tập đoàn X qua Trino (row filter theo tenant, đã che dữ liệu cá nhân); nhân viên không có quyền thì bị chặn.
// Chỉ đọc, chạy lại được trên cùng CSDL.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
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
  // Bảng không thuộc tenant nào (danh mục quyền chung) không có trong danh mục của người dùng tenant.
  await expect(list.getByText("lakehouse.silver.core_permission")).toHaveCount(0);

  await page.getByRole("group", { name: "Lĩnh vực" }).getByRole("button", { name: /^Mua sắm/ }).click();
  await list.getByRole("button", { name: /^Đề nghị mua sắm/ }).click();
  const detail = page.locator("article");
  await expect(detail.getByRole("heading", { name: "Đề nghị mua sắm" })).toBeVisible();
  await expect(detail.getByText("lakehouse.silver.proc_purchase_request")).toBeVisible();
  await expect(detail.getByRole("cell", { name: "total_amount" })).toBeVisible();

  // Số dòng và dữ liệu mẫu thật (CDC → Lakehouse có thể trễ vài giây sau khi hệ thống vừa khởi động).
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
