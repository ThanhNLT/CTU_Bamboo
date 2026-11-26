/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const STAMP = Date.now().toString(36);
const TITLE = `Hướng dẫn E2E ${STAMP}`;
const SECRET_WORD = `kimchinam${STAMP}`;

async function login(page: Page, username: string) {
  await page.goto("/login");
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
  await expect(page.locator("#username")).toBeVisible();
}

test("đề xuất tài liệu, duyệt, xuất bản và tìm toàn văn trong thư viện", async ({ page }) => {
  test.setTimeout(180_000);

  await login(page, "nv.muahang.dienthoai");
  await page.goto("/h/library");
  await page.getByRole("button", { name: "Đề xuất tài liệu" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Tên tài liệu").fill(TITLE);
  await form.getByRole("combobox", { name: "Loại" }).click({ force: true });
  await page.locator(".ant-select-item-option", { hasText: "Hướng dẫn" }).first().click();
  await form.getByLabel("Cả tập đoàn").check();
  await form.getByLabel("Tóm tắt").fill("Hướng dẫn thử nghiệm tự động.");
  await form.getByLabel("Mục lục").fill("Chuẩn bị\nThực hiện");
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByText("Đã lưu nháp. Đính kèm tệp rồi gửi duyệt.")).toBeVisible();
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  const url = page.url();

  await page.locator('input[type="file"]').setInputFiles({
    name: "huong-dan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Hướng dẫn nội bộ. Mã tra cứu ${SECRET_WORD}.\n`),
  });
  await expect(page.getByText("Sạch")).toBeVisible();
  await page.getByRole("button", { name: "Gửi duyệt" }).click();
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  await expect(page.getByText("Chờ duyệt").first()).toBeVisible();
  await logout(page);

  await login(page, "tp.muahang.dienthoai");
  await page.goto("/p/tasks");
  await expect(page.getByText(`Đề xuất tài liệu: ${TITLE}`).first()).toBeVisible();
  await page.goto(url);
  await page.getByRole("button", { name: "Xử lý duyệt" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã xuất bản").first()).toBeVisible();
  await logout(page);

  await login(page, "kd.chip");
  await page.goto("/h/library");
  await expect(page.getByText(TITLE).first()).toBeVisible();
  const search = page.getByPlaceholder(/Tìm/).first();
  await search.fill(SECRET_WORD);
  await expect(async () => {
    await search.fill("");
    await search.fill(SECRET_WORD);
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
});
