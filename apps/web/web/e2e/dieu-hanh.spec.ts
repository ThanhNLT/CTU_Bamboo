// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Trung tâm điều hành (ADR #49): bản đồ cơ sở có số thật, các bảng Quy trình / Sản xuất / Bệnh viện / Chất lượng dữ
// liệu có dữ liệu; số liệu bệnh viện (tenant con) chỉ cho người có quyền điều hành tập đoàn; trang Bản đồ cũ chuyển
// về Trung tâm điều hành.

// ===== Thư viện =====
import { expect, test, type Page } from "@playwright/test"; // Playwright

// ===== Hằng số =====
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

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
test("các bảng điều hành và bản đồ cơ sở dùng số liệu thật", async ({ page }) => {
  await login(page, "tgd");
  await page.goto("/d/map");
  await expect(page).toHaveURL(/\/d\/ops$/);

  // Bản đồ: các công ty có tọa độ, Chip X có lô đang giữ.
  const map = page.getByRole("region", { name: "Cơ sở và cảnh báo" });
  const sites = map.getByRole("list", { name: "Danh sách cơ sở" });
  await expect(sites.getByText("Công ty Chip X")).toBeVisible();
  await expect(sites.getByText("Bệnh viện X")).toBeVisible();
  const chip = sites.getByRole("button", { name: /Công ty Chip X/ });
  if ((await chip.getAttribute("aria-expanded")) !== "true") await chip.click();
  await expect(sites.getByText(/lô đang giữ: PMIC-R-03/)).toBeVisible();

  const tab = (name: string) => page.getByRole("tab", { name, exact: true }).click();
  await tab("Quy trình");
  await expect(page.getByRole("region", { name: "Điểm nghẽn theo vị trí duyệt" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Theo loại chứng từ" }).getByText("Đề nghị mua sắm")).toBeVisible();

  await tab("Sản xuất");
  await expect(page.getByRole("region", { name: "Lô đang giữ" }).getByText("PMIC-R-03")).toBeVisible();
  await expect(page.getByRole("region", { name: "Đơn hàng nội bộ giữa các công ty" })).toBeVisible();

  await tab("Bệnh viện");
  await expect(page.getByRole("heading", { name: "Bệnh viện X" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Theo khối / khoa", exact: true }).getByRole("cell", { name: "Khoa Dược" }),
  ).toBeVisible();

  await tab("Chất lượng dữ liệu");
  await expect(page.getByRole("region", { name: "Kiểm tra dữ liệu" }).getByText("Vị trí đang trống")).toBeVisible();
  await logout(page);

  // Chuyên viên: không có quyền điều hành tập đoàn nên không xem số liệu bệnh viện.
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/d/ops");
  await tab("Bệnh viện");
  await expect(page.getByText("Bạn chưa được xem số liệu bệnh viện")).toBeVisible();
});
