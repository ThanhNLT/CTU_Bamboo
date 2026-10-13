// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Quản trị dữ liệu tenant (ADR #44) qua giao diện thật: CDO (vai trò Quản trị tổ chức) thêm đơn vị, vị trí, người,
// bổ nhiệm, tạo tài khoản, tạo vai trò và cấp cho vị trí; nhập đơn vị từ CSV (xem trước lỗi rồi ghi).
// Nhân viên thường không thấy nhóm Quản trị.
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const STAMP = Date.now().toString().slice(-7);
const UNIT = `E2E_${STAMP}`;
const PERSON = `Người Thử ${STAMP}`;
const ROLE = `E2E_VT_${STAMP}`;

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

/** Chọn một mục của Select / TreeSelect antd theo nhãn trường và chữ gõ vào. */
async function pick(page: Page, label: string, text: string) {
  // Hộp thoại có thể mở chồng lên ngăn kéo: gõ thẳng vào ô tìm của Select (không cần bấm).
  await page.locator(".ant-modal:visible").getByRole("combobox", { name: label, exact: true }).fill(text);
  await page
    .locator(
      ".ant-select-dropdown:visible .ant-select-item-option, .ant-select-dropdown:visible .ant-select-tree-treenode",
    )
    .filter({ hasText: text })
    .first()
    .click();
}

test("quản trị cơ cấu, người dùng, phân quyền và nhập Excel", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "cdo");
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await nav.getByText("Cơ cấu tổ chức").click();

  // Đơn vị con dưới Văn phòng Chuyển đổi số.
  await page.getByPlaceholder("Tìm đơn vị theo tên, mã").fill("Chuyển đổi số");
  await page.getByRole("tree").getByText("Văn phòng Chuyển đổi số").click();
  await page.getByRole("button", { name: "Đơn vị con" }).click();
  let dialog = page.locator(".ant-modal:visible");
  await dialog.getByLabel("Mã đơn vị").fill(UNIT);
  await dialog.getByLabel("Tên đơn vị").fill(`Nhóm Thử ${STAMP}`);
  await pick(page, "Loại đơn vị", "Phòng");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã thêm đơn vị.")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Nhóm Thử ${STAMP}` })).toBeVisible();

  // Vị trí trưởng; thêm vị trí trưởng thứ hai bị CSDL chặn (một trưởng mỗi đơn vị).
  await page.getByRole("button", { name: "Thêm vị trí" }).click();
  dialog = page.locator(".ant-modal:visible");
  await dialog.getByLabel("Tên vị trí (ghế)").fill("Trưởng nhóm");
  await dialog.getByLabel("Là trưởng đơn vị").click();
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu vị trí.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Trưởng đơn vị Trưởng nhóm/ })).toBeVisible();
  await expect(page.getByText("Ghế trống")).toBeVisible();

  // Người mới, bổ nhiệm vào ghế, tạo tài khoản.
  await nav.getByText("Người dùng").click();
  await page.getByRole("button", { name: "Thêm người" }).click();
  dialog = page.locator(".ant-modal:visible");
  await dialog.getByLabel("Họ tên").fill(PERSON);
  await dialog.getByLabel("Mã nhân viên").fill(`NV${STAMP}`);
  await dialog.getByRole("button", { name: "Lưu" }).click();
  const drawer = page.locator(".ant-drawer-content");
  await expect(drawer.getByText(PERSON).first()).toBeVisible();
  await drawer.getByRole("button", { name: "Bổ nhiệm" }).click();
  await pick(page, "Vị trí còn trống", `Nhóm Thử ${STAMP}`);
  await page.locator(".ant-modal:visible").getByRole("button", { name: "Bổ nhiệm" }).click();
  await expect(page.getByText("Đã bổ nhiệm.")).toBeVisible();
  await expect(drawer.getByText("Trưởng nhóm")).toBeVisible();
  await expect(drawer.getByText(/Giữ chính · .* – nay/)).toBeVisible();

  await drawer.getByLabel("Tên đăng nhập").fill(`e2e.${STAMP}`);
  await drawer.getByRole("button", { name: "Tạo tài khoản" }).click();
  const accounts = page.getByRole("dialog", { name: "Tài khoản đăng nhập" });
  await expect(accounts.getByText("Mật khẩu tạm chỉ hiện một lần")).toBeVisible();
  await expect(accounts.getByRole("cell", { name: `e2e.${STAMP}` })).toBeVisible();
  await expect(accounts.getByRole("cell", { name: /^[A-Za-z2-9]{14}$/ })).toBeVisible();
  await accounts.getByRole("button", { name: "Đã lưu, đóng" }).click();
  await expect(drawer.getByText("Đã có tài khoản")).toBeVisible();
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await expect(drawer).toBeHidden();

  // Vai trò mới với một quyền, cấp cho vị trí vừa tạo.
  await nav.getByText("Vai trò & phân quyền").click();
  await page.getByRole("button", { name: "Thêm vai trò" }).click();
  dialog = page.locator(".ant-modal:visible");
  await dialog.getByLabel("Mã vai trò").fill(ROLE);
  await dialog.getByLabel("Tên vai trò").fill(`Vai trò thử ${STAMP}`);
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(/Đã thêm vai trò/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Xem đề nghị mua sắm/ }).check();
  await page.getByRole("button", { name: "Lưu bộ quyền" }).click();
  await expect(page.getByText(/Đã lưu bộ quyền/)).toBeVisible();
  await page.getByRole("button", { name: "Cấp vai trò" }).click();
  await pick(page, "Vị trí", `Nhóm Thử ${STAMP}`);
  await page.locator(".ant-modal:visible").getByRole("button", { name: "Cấp vai trò" }).click();
  await expect(page.getByText("Đã cấp vai trò.")).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(`Trưởng nhóm.*${PERSON}`) })).toBeVisible();

  // Nhập đơn vị từ CSV: dòng sai mã đơn vị cha bị báo, không ghi; sửa rồi ghi.
  await nav.getByText("Cơ cấu tổ chức").click();
  await page.getByRole("button", { name: "Nhập từ Excel" }).click();
  await page.getByRole("menuitem", { name: "Nhập đơn vị" }).click();
  const importer = page.getByRole("dialog", { name: "Nhập đơn vị từ Excel" });
  const csv = (parent: string) =>
    Buffer.from(
      `Mã đơn vị,Tên đơn vị,Mã đơn vị cha,Mã loại đơn vị\n${UNIT}_A,Tổ A ${STAMP},${UNIT},PHONG\n${UNIT}_B,Tổ B ${STAMP},${parent},PHONG\n`,
    );
  await expect(importer.getByText("Kéo thả hoặc bấm để chọn tệp")).toBeVisible();
  await importer
    .locator('input[type="file"]')
    .setInputFiles({ name: "don-vi.csv", mimeType: "text/csv", buffer: csv("KHONG_CO") });
  await expect(importer.getByText("1 / 2 dòng có lỗi")).toBeVisible();
  await expect(importer.getByRole("cell", { name: "Không có đơn vị mã KHONG_CO" })).toBeVisible();
  await importer.getByRole("button", { name: "Chọn tệp khác" }).click();
  await expect(importer.getByText("Kéo thả hoặc bấm để chọn tệp")).toBeVisible();
  await importer
    .locator('input[type="file"]')
    .setInputFiles({ name: "don-vi.csv", mimeType: "text/csv", buffer: csv(UNIT) });
  await expect(importer.getByText("2 dòng hợp lệ — sẵn sàng ghi.")).toBeVisible();
  await importer.getByRole("button", { name: "Ghi 2 dòng" }).click();
  await expect(page.getByText("Đã nhập 2 dòng đơn vị.")).toBeVisible();
  await page.getByPlaceholder("Tìm đơn vị theo tên, mã").fill(`Tổ B ${STAMP}`);
  await expect(page.getByRole("tree").getByText(`Tổ B ${STAMP}`)).toBeVisible();
  await logout(page);

  // Nhân viên thường: không có nhóm Quản trị, mở thẳng đường dẫn thì báo thiếu quyền.
  await login(page, "nv.muahang.dienthoai");
  await expect(nav.getByText("Cơ cấu tổ chức")).toHaveCount(0);
  await page.goto("/admin/org");
  await expect(page.getByText("Bạn chưa có quyền quản trị mục này.")).toBeVisible();
});
