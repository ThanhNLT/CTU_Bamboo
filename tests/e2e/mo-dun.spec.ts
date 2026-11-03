// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

async function login(page: Page, username: string, tenant: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText(tenant).first()).toBeVisible();
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Điều hướng chính" });

// Bật/tắt áp dụng cho cả công ty: chạy ở Bệnh viện X để không đụng các bài E2E khác (chủ yếu ở Tập đoàn X) chạy song song
test("quản trị viên tắt rồi bật lại một chức năng, menu và trang đổi theo", async ({ page }) => {
  await login(page, "tp.khth.benhvien", "Bệnh viện X");
  await page.goto("/admin/modules");
  await expect(page.getByRole("heading", { name: "Quản lý chức năng" })).toBeVisible();
  await expect(card(page, "Sổ cái").getByText("Đang bật")).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toBeVisible();

  // chức năng đang có chức năng khác dựa vào thì không tắt được
  await card(page, "Phê duyệt").getByRole("button", { name: "Tắt" }).click();
  await page.getByRole("button", { name: "Tắt", exact: true }).last().click();
  await expect(page.getByText(/Không tắt được Phê duyệt: mô-đun .* đang bật và dựa vào nó/)).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();

  await card(page, "Sổ cái").getByRole("button", { name: "Tắt" }).click();
  await page.getByRole("button", { name: "Tắt", exact: true }).last().click();
  await expect(page.getByText(/Đã tắt Sổ cái/)).toBeVisible();
  await expect(card(page, "Sổ cái").getByText("Chưa bật")).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toHaveCount(0);

  await page.goto("/d/ledger");
  await expect(page.getByText("Chức năng Sổ cái chưa được bật")).toBeVisible();
  // trang không kịp gọi API của mô-đun đã tắt trước khi biết trạng thái
  await expect(page.getByText(/Không tải được/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mở Quản lý chức năng" }).click();

  await card(page, "Sổ cái").getByRole("button", { name: "Bật" }).click();
  await page.getByRole("button", { name: "Bật", exact: true }).last().click();
  await expect(page.getByText(/Đã bật Sổ cái/)).toBeVisible();
  await expect(nav(page).getByText("Sổ cái")).toBeVisible();
  await page.goto("/d/ledger");
  await expect(page.getByText("Chức năng Sổ cái chưa được bật")).toHaveCount(0);
});

test("người không có quyền không thấy trang quản lý chức năng", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai", "Tập đoàn X");
  await expect(nav(page).getByText("Quản lý chức năng")).toHaveCount(0);
  await page.goto("/admin/modules");
  await expect(page.getByText("Bạn chưa có quyền quản trị mục này.")).toBeVisible();
});
