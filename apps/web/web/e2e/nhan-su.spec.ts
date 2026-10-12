// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Tiếp nhận nhân sự (ADR #41): phòng nhân sự lập hồ sơ, trưởng phòng nhận người rồi giám đốc công ty duyệt;
// người duyệt chỉ thấy dữ liệu nhạy cảm đã che; duyệt xong có tài khoản, nhân viên mới đăng nhập đổi mật khẩu.
// Dùng một ghế tuyển mới của Phòng Mua hàng Điện thoại X (dữ liệu demo), nên chạy trên CSDL mới seed.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const STAMP = Date.now().toString(36);
const NAME = `Trần Thị Thử ${STAMP}`;
const USERNAME = `e2e.${STAMP}`;

async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

async function logout(page: Page) {
  // Chờ Keycloak xóa phiên SSO: nút đăng nhập có thể hiện trước khi trình duyệt gọi endpoint đăng xuất; điều hướng
  // sớm sẽ cắt ngang, phiên cũ còn nên check-sso đăng nhập lại người cũ và không còn trang đăng nhập.
  const loggedOut = page.waitForResponse((r) => r.url().includes("/protocol/openid-connect/logout"));
  // Đăng xuất nằm trong menu tài khoản (avatar) trên header.
  await page.locator("header").getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await loggedOut;
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toBeVisible();
}

async function approveFromInbox(page: Page) {
  await page.goto("/p/inbox");
  const row = page.locator("tr", { hasText: `Tiếp nhận ${NAME}` });
  await row.getByRole("button", { name: "Xử lý" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText(/Đã ghi nhận/)).toBeVisible();
  await expect(page.locator("tr", { hasText: `Tiếp nhận ${NAME}` })).toHaveCount(0);
}

test("lập hồ sơ tiếp nhận, duyệt hai cấp, tạo tài khoản, nhân viên mới đăng nhập", async ({ page }) => {
  test.setTimeout(240_000);

  // Chuyên viên nhân sự Điện thoại X lập hồ sơ.
  await login(page, "ns.dienthoai");
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Tiếp nhận nhân sự").click();
  await page.getByRole("button", { name: /Lập hồ sơ tiếp nhận/ }).click();
  await page.getByLabel("Họ và tên").fill(NAME);
  await expect(page.getByLabel(/Tên đăng nhập/)).toHaveValue(/tran/);
  await page.getByLabel(/Tên đăng nhập/).fill(USERNAME);
  await page.getByLabel("Số CCCD").fill("079 203 456 789");
  await page.getByLabel("Địa chỉ thường trú").fill("25 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh");
  await page.getByLabel("Số tài khoản").fill("0071000123456");
  await page.getByLabel(/Email công việc/).fill(`${USERNAME}@demo.bamboo.local`);
  await page.getByLabel(/Vị trí bổ nhiệm/).click();
  await page.locator(".ant-select-item-option", { hasText: "Phòng Mua hàng" }).first().click();
  await page.getByLabel(/Lương đề xuất/).fill("18000000");
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();

  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.getByText("•••••••••789")).toBeVisible();
  await expect(page.getByText("•••, TP. Hồ Chí Minh")).toBeVisible();
  await expect(page.getByText(/Trưởng phòng – Phòng Mua hàng/)).toBeVisible();
  await expect(page.getByText(/Giám đốc – Công ty Điện thoại X/)).toBeVisible();
  const detail = page.url();

  // Phòng nhân sự xem được bản đầy đủ.
  await page.getByRole("button", { name: "Xem đầy đủ" }).click();
  await expect(page.getByRole("dialog").getByText("079203456789")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).click();
  await logout(page);

  // Trưởng phòng Mua hàng (quản lý trực tiếp của vị trí): chỉ thấy bản che, duyệt.
  await login(page, "tp.muahang.dienthoai");
  await page.goto(detail);
  await expect(page.getByText("•••••••••789")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xem đầy đủ" })).toHaveCount(0);
  await approveFromInbox(page);
  await logout(page);

  // Giám đốc Điện thoại X duyệt bước cuối.
  await login(page, "gd.dienthoai");
  await approveFromInbox(page);
  await logout(page);

  // Phòng nhân sự: đã tiếp nhận, tài khoản được tạo ở nền, xem mật khẩu tạm để bàn giao.
  await login(page, "ns.dienthoai");
  await page.goto(detail);
  await expect(page.getByText(/mã nhân viên NV-\d{4}-\d{6}/)).toBeVisible();
  await expect(page.getByText(`Đã có tài khoản: ${USERNAME}`)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Xem đầy đủ" }).click();
  const temp = (await page.getByRole("dialog").locator("code").innerText()).trim();
  expect(temp).toMatch(/^[A-Za-z0-9]{14}$/);
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).click();
  await logout(page);

  // Nhân viên mới đăng nhập bằng mật khẩu tạm, Keycloak bắt đổi mật khẩu.
  await login(page, USERNAME, temp);
  await page.locator("#password-new").fill(`${PASSWORD}-${STAMP}`);
  await page.locator("#password-confirm").fill(`${PASSWORD}-${STAMP}`);
  await page.locator("input[type=submit], button[type=submit]").first().click();
  // Header hiện chữ viết tắt trong avatar; tên đầy đủ nằm ở nhãn của nút tài khoản.
  await expect(page.locator("header").getByRole("button", { name: `Tài khoản: ${NAME}` })).toBeVisible();
});
