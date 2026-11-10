/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const NAME = `Duyệt hợp đồng E2E ${Date.now()}`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("tạo quy trình, sửa thuộc tính, kiểm tra, chạy thử sandbox và phát hành", async ({ page }) => {
  await login(page, "cdo");
  await page.goto("/p/process");
  await expect(page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm")).toBeVisible();

  await page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();
  await page.getByRole("button", { name: "Chạy thử sandbox" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua \d+ bước tới “Đã duyệt”/)).toBeVisible();

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

  await page.getByRole("button", { name: "Phát hành", exact: true }).click();
  await page.getByRole("dialog").getByText("Toàn tập đoàn").click();
  await page.getByRole("dialog").getByRole("button", { name: "Phát hành và thông báo" }).click();
  await expect(page.getByText(/Đã phát hành v1 và thông báo cho \d+ người/)).toBeVisible();
  await page.getByRole("button", { name: "Chạy thử sandbox" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua 3 bước tới “Hoàn tất”/)).toBeVisible();
  await page.getByText(/Phiên bản & chạy thử/).click();
  await expect(page.getByRole("region", { name: "Lần chạy thử" }).getByText("Pháp chế duyệt").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Phiên bản phát hành" }).getByText("v1")).toBeVisible();
});

test("nhân viên chỉ xem ảnh sơ đồ, không có công cụ thiết kế", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/process");
  await expect(page.getByRole("heading", { name: "Quy trình công việc" })).toBeVisible();
  await page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();
  await expect(page.locator(".djs-palette")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Lưu bản nháp|Phát hành|Chạy demo|Yêu cầu sửa chữa/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tạo quy trình" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Thuộc tính" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vừa khung nhìn" })).toBeVisible();
});

test("giám đốc yêu cầu sửa chữa và chạy demo, người thiết kế nhận thông báo", async ({ page }) => {
  const ASK = `Thêm bước pháp chế ${Date.now()}`;
  await login(page, "gd.dienthoai");
  await page.goto("/p/process");
  await page.getByRole("navigation", { name: "Quy trình" }).getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /Lưu bản nháp|Phát hành/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Chạy demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua \d+ bước tới “Đã duyệt”/)).toBeVisible();

  await page.getByRole("button", { name: "Yêu cầu sửa chữa" }).click();
  await page.getByLabel("Nội dung yêu cầu sửa chữa").fill(ASK);
  await page.getByRole("dialog").getByRole("button", { name: "Gửi yêu cầu" }).click();
  await expect(page.getByText("Đã gửi yêu cầu sửa chữa tới người thiết kế quy trình.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Yêu cầu sửa chữa" }).getByText(ASK)).toBeVisible();
});

test("trưởng phòng vẽ quy trình cho phòng mình, phát hành, nhân viên được báo và xem được", async ({
  page,
  browser,
}) => {
  const NAME2 = `Quy trình phòng ${Date.now()}`;
  await login(page, "tp.muahang.dienthoai");
  await page.goto("/p/process");
  await page.getByRole("button", { name: "Tạo quy trình" }).click();
  await page.getByLabel("Tên quy trình mới").fill(NAME2);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo" }).click();
  await expect(page.getByText(`Đã tạo quy trình “${NAME2}”.`)).toBeVisible();
  await page.getByRole("button", { name: "Phát hành", exact: true }).click();
  await page.getByRole("dialog").getByText("Phòng ban").click();
  await page.getByRole("dialog").getByRole("button", { name: "Phát hành và thông báo" }).click();
  await expect(page.getByText(/Đã phát hành v1 và thông báo cho \d+ người/)).toBeVisible();

  const staff = await browser.newPage({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8000" });
  await login(staff, "nv.muahang.dienthoai");
  await staff.getByRole("button", { name: /thông báo chưa đọc/ }).click();
  await expect(staff.getByText(`Quy trình “${NAME2}” đã phát hành v1`).first()).toBeVisible();
  await staff.goto("/p/process");
  await staff.getByRole("navigation", { name: "Quy trình" }).getByText(NAME2).click();
  await expect(staff.locator(".djs-container svg").first()).toBeVisible();
  await expect(staff.getByRole("button", { name: /Lưu bản nháp|Phát hành|Chạy demo/ })).toHaveCount(0);
});

test("chạy thử với biến và quyết định riêng, khôi phục phiên bản, xóa nháp", async ({ page }) => {
  await login(page, "cdo");
  await page.goto("/p/process");
  const nav = page.getByRole("navigation", { name: "Quy trình" });
  await nav.getByText("Duyệt đề nghị mua sắm").click();
  await expect(page.locator('[data-element-id="approveStep"]')).toBeVisible();

  await page.getByRole("button", { name: "Chạy thử sandbox" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Giá trị biến 1").fill("90000000");
  await dialog.locator(".ant-select").first().click();
  await page.locator(".ant-select-item-option", { hasText: "Từ chối" }).click();
  await dialog.getByRole("button", { name: "Chạy thử" }).click();
  await expect(page.getByText(/Chạy thử đạt: đi qua \d+ bước tới/)).toBeVisible();
  await expect(page.locator(".sandbox-visited").first()).toBeVisible();

  await page.getByText(/Phiên bản & chạy thử/).click();
  await expect(
    page
      .getByRole("region", { name: "Lần chạy thử" })
      .getByText(/amount=90000000/)
      .first(),
  ).toBeVisible();

  const name = `Nháp xóa E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Tạo quy trình" }).click();
  await page.getByLabel("Tên quy trình mới").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Tạo" }).click();
  await expect(page.getByText(`Đã tạo quy trình “${name}”.`)).toBeVisible();
  await page.getByRole("button", { name: "Xóa nháp" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page.getByText("Đã xóa quy trình.")).toBeVisible();
  await expect(nav.getByText(name)).toHaveCount(0);
});
