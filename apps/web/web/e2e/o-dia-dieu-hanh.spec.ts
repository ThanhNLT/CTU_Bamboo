// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Ổ đĩa tài liệu và Trung tâm điều hành dùng dữ liệu thật: tải tệp vào chứng từ qua Ổ đĩa (kiểm dịch thật),
// tệp hiện trong "Tệp tôi tải lên"; Trung tâm điều hành hiện số liệu thật.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const TITLE = `E2E ổ đĩa ${Date.now()}`;
const FILE = `bao-gia-${Date.now()}.pdf`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("tải tệp vào chứng từ qua Ổ đĩa, xem số liệu điều hành", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Màn hình 6.5 inch");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("5");
  await row.locator("input").nth(4).fill("300000");
  // Chỉ lưu nháp: không để lại việc duyệt dở trong CSDL demo (hộp việc cũ phân trang 10 dòng).
  await page.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp")).toBeVisible();
  await expect(page).toHaveURL(/\/p\/documents\/show\//);
  const id = page.url().split("/").pop();

  // Mở chứng từ làm thư mục trong Ổ đĩa (chưa có tệp) rồi tải lên.
  await page.goto(`/h/drive?folder=${id}`);
  await expect(page.getByRole("navigation", { name: "Đường dẫn thư mục" }).getByText(TITLE, { exact: false })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: FILE, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nbao gia o dia\n%%EOF\n"),
  });
  await expect(page.getByLabel("Tiến trình tải lên").getByText("Sạch · đã lưu")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(FILE) }).getByText("Sạch")).toBeVisible();

  // "Tệp tôi tải lên": có thư mục của chứng từ và tệp vừa tải.
  await page.getByRole("navigation", { name: "Vùng lưu trữ" }).getByText("Tệp tôi tải lên").click();
  await expect(page.getByRole("button", { name: new RegExp(TITLE) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(FILE) })).toBeVisible();

  // Trung tâm điều hành: các khối có số thật của tenant (dữ liệu demo có sẵn đề nghị đang chờ của Điện thoại X).
  await page.goto("/d/ops");
  await expect(page.getByRole("region", { name: "Hồ sơ chờ duyệt" }).getByText(/^\d+$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Hồ sơ đang chờ theo công ty" }).getByText("Điện thoại X").first()).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa")).toHaveCount(0);
});
