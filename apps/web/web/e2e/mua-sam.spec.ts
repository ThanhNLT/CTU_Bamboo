// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Luồng chính của ứng dụng mua sắm qua giao diện thật: chuyên viên lập đề nghị kèm dòng hàng và
// báo giá, gửi duyệt; trưởng phòng nhận thông báo, duyệt trong hộp việc.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const TITLE = `E2E mua linh kiện ${Date.now()}`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
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

test("lập đề nghị, đính kèm, gửi duyệt và duyệt", async ({ page }) => {
  // Chuyên viên mua hàng Điện thoại X lập đề nghị.
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Tụ điện 10uF");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("2000");
  await row.locator("input").nth(4).fill("1500");
  await expect(page.getByText(/Tổng cộng:.*3\.000\.000/)).toBeVisible();
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();

  // Trang chi tiết: chờ duyệt, chuỗi duyệt lên trưởng phòng (dưới 50 triệu: quản lý trực tiếp).
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.locator(".ant-page-header-heading-title, .ant-space").getByText("Chờ duyệt").first()).toBeVisible();
  await expect(page.getByText(/Trưởng phòng/).first()).toBeVisible();
  const url = page.url();

  // Đính kèm báo giá: tải lên S3 qua link có chữ ký, kiểm tra rồi nhận.
  await page.locator('input[type="file"]').setInputFiles({
    name: "bao-gia.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nbao gia\n%%EOF\n"),
  });
  await expect(page.getByText("Sạch")).toBeVisible();
  // Tệp giả mạo: khai là PDF nhưng là tệp thực thi → bị loại.
  await page.locator('input[type="file"]').setInputFiles({
    name: "virus.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 not a pdf"),
  });
  await expect(page.getByText("Bị loại – đã xóa")).toBeVisible();

  await page.getByRole("tab", { name: /Trao đổi/ }).click();
  await page.getByPlaceholder(/Trao đổi với/).fill("Nhờ anh/chị duyệt sớm giúp em.");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(page.getByText("Nhờ anh/chị duyệt sớm giúp em.")).toBeVisible();
  await logout(page);

  // Trưởng phòng Mua hàng: có thông báo, duyệt trong hộp việc.
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
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill("kiemnhiem");
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
  await page.getByRole("button", { name: /Bệnh viện X/ }).click();
  await expect(page.locator("header").getByText("Bệnh viện X")).toBeVisible();
  // Ở bệnh viện, người này là nhân viên kiêm nhiệm không có quyền xem đề nghị nào: bảng trống.
  await page.goto("/p/documents");
  await expect(page.locator(".ant-table-placeholder, tr.ant-table-row").first()).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await expect(page.getByText("Linh kiện thay thế cho lô điện thoại bị ảnh hưởng")).toHaveCount(0);
});

test("kiểm toán viên đối soát chuỗi hash nhật ký", async ({ page }) => {
  await login(page, "gd.taichinh");
  await page.locator("aside").getByText("Kiểm toán").click();
  await expect(page.locator("tr.ant-table-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Đối soát chuỗi hash" }).click();
  await expect(page.getByText(/Chuỗi nguyên vẹn: \d+ bản ghi/)).toBeVisible();
});

test("nhân viên không thấy menu nhật ký kiểm toán", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await expect(page.locator("aside").getByText("Đề nghị mua sắm")).toBeVisible();
  await expect(page.locator("aside").getByText("Kiểm toán")).toHaveCount(0);
});
