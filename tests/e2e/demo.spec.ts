/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { expect, test, type Browser, type Page } from "@playwright/test";

const OUT = process.env.DEMO_SHOTS ?? "demo-shots";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

test.use({ viewport: { width: 1440, height: 900 } });

test.skip(!process.env.DEMO_SHOTS, "chỉ chạy khi đặt DEMO_SHOTS");

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

let browserRef: Browser;

async function login(_old: Page | null, username: string, pick?: RegExp): Promise<Page> {
  const context = await browserRef.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8000",
    viewport: { width: 1440, height: 900 },
    locale: "vi-VN",
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  if (pick) await page.getByRole("button", { name: pick }).click();
  if (!pick && username === "kiemnhiem") return page;
  await expect(page.locator("header").getByRole("button", { name: /^Đơn vị:/ })).toBeVisible();
  return page;
}

test("chụp màn hình demo", async ({ browser, page: first }) => {
  test.setTimeout(300_000);
  browserRef = browser;
  let page = first;
  await page.goto("/login");
  await expect(page.locator("#username")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "01-dang-nhap");
  await expect(page.locator("#username")).toBeVisible();
  await shot(page, "02-keycloak");

  page = await login(page, "tgd");
  await page.goto("/p/documents");
  await expect(page.locator("tr.ant-table-row").first()).toBeVisible();
  await shot(page, "03-danh-sach");
  await page.goto("/p/inbox");
  await expect(page.locator("tr.ant-table-row").first()).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "04-hop-viec");
  await page
    .locator("header")
    .getByRole("button", { name: /thông báo chưa đọc$/ })
    .click();
  await page.waitForTimeout(800);
  await shot(page, "05-thong-bao");
  await page.keyboard.press("Escape");
  await page.locator("tr", { hasText: "Linh kiện thay thế" }).locator("a").first().click();
  await expect(page.getByText("Chuỗi duyệt (lần gửi 1)")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "06-chi-tiet");
  await page.getByRole("button", { name: "Xử lý duyệt" }).click();
  await page.getByRole("dialog").getByText("Trả về bổ sung").click();
  await page.waitForTimeout(400);
  await shot(page, "07-xu-ly-duyet");
  await page.keyboard.press("Escape");
  await page.goto("/p/documents");
  await page.getByPlaceholder("Tìm theo số hoặc tiêu đề").fill("Bo mạch");
  await page.keyboard.press("Enter");
  await page.locator("tr", { hasText: "Bo mạch thử nghiệm" }).getByRole("button").click();
  await expect(page.getByText(/Đẩy lên cấp trên/).first()).toBeVisible();
  await shot(page, "08-day-len-cap-tren");

  page = await login(page, "pgd.chip");
  await page.goto("/p/inbox");
  await expect(page.getByText("Duyệt thay (ủy quyền)")).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "09-duyet-thay");

  page = await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill("Chip nguồn thay thế cho dây chuyền SMT");
  const row = page.locator("tr.ant-table-row").first();
  await row.locator(".ant-select").click();
  await page.getByText("LK-PMIC – Chip quản lý nguồn PMIC").click();
  await row.locator("input").nth(3).fill("3000");
  await page.getByRole("button", { name: "Thêm dòng" }).click();
  const row2 = page.locator("tr.ant-table-row").nth(1);
  await row2.getByPlaceholder("Mô tả").fill("Vận chuyển hàng nhanh");
  await row2.locator("input").nth(2).fill("chuyến");
  await row2.locator("input").nth(4).fill("2500000");
  await page
    .getByLabel("Mô tả, lý do mua")
    .fill("Bổ sung linh kiện cho lô điện thoại bị ảnh hưởng bởi sự cố phòng sạch.");
  await page.waitForTimeout(400);
  await shot(page, "10-lap-de-nghi");
  await page.goto("/p/documents");
  await page.getByPlaceholder("Tìm theo số hoặc tiêu đề").fill("Văn phòng phẩm");
  await page.keyboard.press("Enter");
  await page.locator("tr", { hasText: "Văn phòng phẩm quý IV" }).getByRole("button").click();
  await expect(page.getByText("Bị trả về").first()).toBeVisible();
  await page.getByRole("tab", { name: /Trao đổi/ }).click();
  await page.waitForTimeout(400);
  await shot(page, "11-bi-tra-ve-trao-doi");

  page = await login(page, "kiemnhiem");
  await expect(page.getByText("Chọn đơn vị làm việc")).toBeVisible();
  await shot(page, "12-chon-tenant");

  page = await login(page, "gd.taichinh");
  await page.goto("/admin/audit-logs");
  await expect(page.locator("tr.ant-table-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Đối soát chuỗi hash" }).click();
  await expect(page.getByText(/Chuỗi nguyên vẹn/)).toBeVisible();
  await shot(page, "13-kiem-toan");
});
