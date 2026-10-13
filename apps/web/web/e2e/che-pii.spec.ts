// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Che dữ liệu cá nhân (ADR #43): ô trao đổi cảnh báo trước khi gửi số điện thoại, CCCD; nhật ký kiểm toán chỉ
// hiện bản đã che dù người dùng chọn gửi nguyên văn.

// ===== Thư viện =====
import { expect, test, type Page } from "@playwright/test"; // Playwright

// ===== Hằng số =====
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const STAMP = Date.now().toString().slice(-6);
const PHONE = `0912 ${STAMP.slice(0, 3)} ${STAMP.slice(3)}`;

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
  // Chờ Keycloak xóa phiên SSO trước khi đăng nhập tài khoản khác (check-sso sẽ đăng nhập lại người cũ).
  const loggedOut = page.waitForResponse((r) => r.url().includes("/protocol/openid-connect/logout"));
  // Đăng xuất nằm trong menu tài khoản (avatar) trên header.
  await page
    .locator("header")
    .getByRole("button", { name: /^Tài khoản:/ })
    .click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await loggedOut;
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
}

// ===== Kịch bản kiểm thử =====
test("cảnh báo khi trao đổi có số điện thoại, nhật ký kiểm toán chỉ hiện bản che", async ({ page }) => {
  test.setTimeout(150_000);

  // Chuyên viên mua hàng mở một đề nghị xem được và trao đổi.
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents");
  await page.locator("tr.ant-table-row").first().getByRole("button").click();
  await page.getByRole("tab", { name: /Trao đổi/ }).click();
  const box = page.getByPlaceholder(/Trao đổi với/);

  // Gửi bản đã che.
  await box.fill(`Nhà cung cấp mới: chị Lan ${PHONE}`);
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Nội dung có dữ liệu cá nhân").last()).toBeVisible();
  await expect(dialog.getByText("Số điện thoại")).toBeVisible();
  await dialog.getByRole("button", { name: "Gửi bản đã che" }).click();
  await expect(dialog).toHaveCount(0);
  // Khớp chính xác: hộp thoại đang đóng vẫn chứa "Bản đã che: …".
  await expect(page.getByText(`Nhà cung cấp mới: chị Lan 0912 *** ${STAMP.slice(3)}`, { exact: true })).toBeVisible();

  // Vẫn gửi nguyên văn: trao đổi giữ số, nhật ký kiểm toán thì không.
  await box.fill(`Gọi lại giúp em số ${PHONE}`);
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Vẫn gửi nguyên văn" }).click();
  await expect(page.getByText(`Gọi lại giúp em số ${PHONE}`, { exact: true })).toBeVisible();
  await logout(page);

  // Giám đốc tài chính (quyền audit.read) xem nhật ký: dữ liệu trước/sau đã che.
  await login(page, "gd.taichinh");
  await page.goto("/admin/audit-logs");
  await page.locator(".ant-select", { hasText: "Lọc theo bảng" }).click();
  await page.locator(".ant-select-item-option", { hasText: "collab.comment" }).click();
  await page.locator("tr.ant-table-row").first().locator(".ant-table-row-expand-icon").click();
  await expect(page.getByText("Đã che: Số điện thoại")).toBeVisible();
  await expect(page.getByText(`Gọi lại giúp em số 0912 *** ${STAMP.slice(3)}`)).toBeVisible();
  await expect(page.getByText(PHONE)).toHaveCount(0);
});
