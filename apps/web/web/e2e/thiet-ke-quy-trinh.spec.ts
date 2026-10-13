// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thiết kế quy trình (ADR #47): soạn BPMN bằng bpmn-js, sửa thuộc tính, kiểm tra ở máy chủ, chạy thử trên Flowable
// (sandbox), phát hành; người không có quyền wf.process.design chỉ xem.

// ===== Thư viện =====
import { expect, test, type Page } from "@playwright/test"; // Playwright

// ===== Hằng số =====
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const NAME = `Duyệt hợp đồng E2E ${Date.now()}`;

// ===== Hàm tiện ích =====
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

// ===== Kịch bản kiểm thử =====
test("tạo quy trình, sửa thuộc tính, kiểm tra, chạy thử sandbox và phát hành", async ({ page }) => {
  await login(page, "cdo");
  await page.goto("/p/process");
  await expect(page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm")).toBeVisible();

  // Quy trình mẫu chạy thử được: đi tới kết thúc "Đã duyệt".
  await page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();
  await page.getByRole("button", { name: "Chạy thử sandbox" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua \d+ bước tới “Đã duyệt”/)).toBeVisible();

  // Tạo quy trình mới, đổi tên tác vụ, gắn hạn xử lý sai rồi sửa, lưu và kiểm tra.
  await page.getByRole("button", { name: "Tạo quy trình" }).click();
  await page.getByLabel("Tên quy trình mới").fill(NAME);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo" }).click();
  await expect(page.getByText(`Đã tạo quy trình “${NAME}”.`)).toBeVisible();
  await page.locator('[data-element-id="review"]').click();
  const props = page.getByRole("region", { name: "Thuộc tính" });
  await props.getByLabel("Tên phần tử").fill("Pháp chế duyệt");
  await props.getByLabel("Hạn xử lý").fill("2 ngày");
  await page.getByRole("button", { name: /Lưu bản nháp/ }).click();
  await expect(page.getByText("Đã lưu bản nháp (còn 1 lỗi).")).toBeVisible();
  const check = page.getByRole("region", { name: "Kết quả kiểm tra" });
  await expect(check.getByText(/Hạn xử lý “2 ngày”/)).toBeVisible();
  await check.getByText(/Hạn xử lý “2 ngày”/).click();
  await props.getByLabel("Hạn xử lý").fill("P2D");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await expect(page.getByText("Kiểm tra: không có vấn đề.")).toBeVisible();

  // Phát hành (tự lưu bản nháp), chạy thử, xem lịch sử.
  await page.getByRole("button", { name: "Phát hành", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Phát hành", exact: true }).click();
  await expect(page.getByText("Đã phát hành v1.")).toBeVisible();
  await page.getByRole("button", { name: "Chạy thử sandbox" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua 3 bước tới “Hoàn tất”/)).toBeVisible();
  await page.getByText(/Phiên bản & chạy thử/).click();
  await expect(page.getByRole("region", { name: "Lần chạy thử" }).getByText("Pháp chế duyệt").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Phiên bản phát hành" }).getByText("v1")).toBeVisible();
});

test("người không có quyền thiết kế chỉ xem", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/process");
  await page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /Lưu bản nháp/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tạo quy trình" })).toHaveCount(0);
  await expect(page.getByText("cần quyền wf.process.design để sửa")).toBeVisible();
});
