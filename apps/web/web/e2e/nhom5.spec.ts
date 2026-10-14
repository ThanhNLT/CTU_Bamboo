// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhóm 5 (ADR #50): KPI ghim Trang chủ chọn lại được, Bản sao số đọc số đo và ghi nhận sự cố, Phả hệ hiện kiểm tra
// lỗi lan xuống và báo sự cố dữ liệu. Dữ liệu từ tệp demo (app.demo_load); chạy lại nhiều lần được.

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
  await expect(page.getByRole("button", { name: /^Tài khoản:/ })).toBeVisible();
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
test("KPI ghim, Bản sao số, Phả hệ dữ liệu dùng dữ liệu trong CSDL", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "tgd");

  // KPI ghim: có sẵn, thêm "Lô đang giữ" rồi bỏ lại.
  const kpis = page.getByRole("region", { name: "KPI đã ghim" });
  await expect(kpis.getByText("Duyệt đúng hạn")).toBeVisible();
  await kpis.getByRole("button", { name: "Chọn KPI" }).click();
  const picker = page.getByRole("dialog", { name: "Chọn KPI ghim lên Trang chủ" });
  await picker.getByRole("checkbox", { name: /Lô đang giữ/ }).check();
  await picker.getByRole("button", { name: "Lưu" }).click();
  await expect(kpis.getByText("Lô đang giữ")).toBeVisible();
  await kpis.getByRole("button", { name: "Chọn KPI" }).click();
  await picker.getByRole("checkbox", { name: /Lô đang giữ/ }).uncheck();
  await picker.getByRole("button", { name: "Lưu" }).click();
  await expect(kpis.getByText("Lô đang giữ")).toHaveCount(0);

  // Bản sao số: CR-02 có số đo, biểu đồ, sự cố; ghi nhận nếu còn sự cố chờ.
  await page.goto("/d/twin?entity=CR-02");
  await expect(page.getByRole("heading", { name: /Phòng sạch CR-02/ })).toBeVisible();
  await page
    .getByRole("group", { name: /Chỉ số cảm biến/ })
    .getByRole("button", { name: /Hạt bụi ≥0,5 µm/ })
    .click();
  await expect(page.getByRole("region", { name: /Biểu đồ Hạt bụi ≥0,5 µm/ })).toBeVisible();
  const incidents = page.getByRole("region", { name: "Sự cố gần đây" });
  await expect(incidents.getByText(/SC-\d{4}/).first()).toBeVisible();
  const ack = page.getByRole("button", { name: /^Ghi nhận sự cố SC-/ });
  if (await ack.isVisible()) {
    await ack.click();
    await page.getByRole("textbox", { name: "Hướng xử lý" }).fill("E2E: kiểm tra bộ lọc HEPA, theo dõi 30 phút");
    await page.getByRole("dialog").getByRole("button", { name: "Ghi nhận" }).click();
    await expect(page.getByText(/^Đã ghi nhận SC-/)).toBeVisible();
  }
  await expect(incidents.getByText(/Đã ghi nhận:/).first()).toBeVisible();
  await page.getByRole("button", { name: "24 giờ" }).click();
  await expect(page.getByRole("heading", { name: /24 giờ qua/ })).toBeVisible();

  // Phả hệ: kiểm tra lỗi trên silver.wf_task lan tới KPI; báo sự cố dữ liệu.
  await page.goto("/d/lineage");
  await expect(page.getByText(/closed_at không rỗng với việc đã xong/).first()).toBeVisible();
  await page.getByRole("button", { name: "Báo sự cố dữ liệu" }).click();
  const dialog = page.getByRole("dialog", { name: "Báo sự cố dữ liệu" });
  await dialog.getByLabel("Mô tả").fill("E2E: số việc duyệt đúng hạn tháng này thấp bất thường");
  await dialog.getByRole("button", { name: "Gửi báo cáo" }).click();
  await expect(page.getByText(/Đã tạo sự cố dữ liệu DQ-/)).toBeVisible();
  await logout(page);

  // Bệnh viện X: thấy thiết bị y tế của mình (tủ vắc-xin TL-02).
  await login(page, "gd.benhvien");
  await page.goto("/d/twin?entity=TL-02");
  await expect(page.getByRole("heading", { name: /Tủ bảo quản vắc-xin TL-02/ })).toBeVisible();
});
