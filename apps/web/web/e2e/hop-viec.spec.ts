// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hộp việc (/p/tasks), Trang chủ và Hồ sơ dùng dữ liệu thật: đề nghị vừa gửi hiện trong việc của người duyệt,
// trả lại bắt buộc ý kiến, duyệt xong thì việc biến mất và hồ sơ chuyển sang Đã duyệt.

// ===== Thư viện =====
import { expect, test, type Page } from "@playwright/test"; // Playwright

// ===== Hằng số =====
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const TITLE = `E2E hộp việc ${Date.now()}`;

// ===== Hàm tiện ích =====
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

// ===== Kịch bản kiểm thử =====
test("duyệt đề nghị mua sắm trong Hộp việc", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Pin 5000mAh");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("10");
  await row.locator("input").nth(4).fill("200000");
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await logout(page);

  await login(page, "tp.muahang.dienthoai");
  // Trang chủ: việc mới nằm trong "Việc của tôi", bấm vào mở đúng việc trong Hộp việc.
  await page.goto("/");
  await page.getByText("Lịch", { exact: true }).click(); // Chế độ Lịch hiện mọi việc (Danh sách chỉ 4 việc gấp nhất).
  await page
    .getByRole("link", { name: new RegExp(TITLE) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/p\/tasks\?doc=/);
  const detail = page.locator("header", { has: page.getByRole("heading", { name: TITLE }) });
  await expect(detail).toBeVisible();
  await expect(page.getByText(/Chứng từ không có tệp đính kèm/)).toBeVisible();

  // Trả lại không có ý kiến → báo lỗi, không gọi máy chủ.
  await page.getByRole("button", { name: "Trả lại" }).click();
  await expect(page.getByText("Nhập ý kiến để người nộp biết cần bổ sung gì.")).toBeVisible();

  await page.getByLabel("Ý kiến của bạn").fill("Đồng ý mua.");
  await page.getByRole("button", { name: "Duyệt", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByText(/^Đã duyệt PR-/)).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(TITLE) })).toHaveCount(0);

  // Hồ sơ: chứng từ đã duyệt, quy trình ghi người duyệt cấp 1.
  await page.goto("/p/records");
  await page.getByPlaceholder("Mã, tiêu đề, người nộp").fill(TITLE);
  const detail2 = page.getByRole("complementary", { name: /^Chi tiết PR-/ });
  await expect(detail2.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(detail2.getByText("Đã duyệt")).toBeVisible();
  await expect(detail2.getByRole("listitem").filter({ hasText: /^Duyệt cấp 1.*đã xong.*Đỗ Thị Hương/ })).toBeVisible();
  await logout(page);
});
