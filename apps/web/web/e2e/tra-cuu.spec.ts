// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Các Action tra cứu trên giao diện: tìm kiếm toàn văn (search_documents), in phiếu PDF
// (get_purchase_request_pdf), sơ đồ quy trình bpmn-js (process_state).
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
const WORD = `Tramcuu${Date.now().toString(36)}`;
const TITLE = `E2E ${WORD} mua ổ cứng`;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
}

test("tìm thấy đề nghị vừa gửi, in phiếu, xem sơ đồ quy trình", async ({ page }) => {
  await login(page, "nv.muahang.dienthoai");
  await page.goto("/p/documents/create");
  await page.getByLabel("Tiêu đề").fill(TITLE);
  const row = page.locator("tr.ant-table-row").first();
  await row.getByPlaceholder("Mô tả").fill("Ổ cứng SSD 1TB");
  await row.locator("input").nth(2).fill("cái");
  await row.locator("input").nth(3).fill("2");
  await row.locator("input").nth(4).fill("1500000");
  await page.getByRole("button", { name: "Lưu và gửi duyệt" }).click();
  await expect(page.getByText("Đã gửi duyệt")).toBeVisible();
  const detail = page.url();

  // Tìm kiếm: gõ không dấu, chữ thường; chỉ mục đồng bộ sau vài giây nên thử lại tới khi có.
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Tìm kiếm").click();
  await expect(page).toHaveURL(/\/i\/search/);
  await expect(async () => {
    await page.getByLabel("Tìm kiếm").fill("");
    await page.getByLabel("Tìm kiếm").fill(`${WORD.toLowerCase()} o cung`);
    await expect(page.getByRole("listitem").filter({ hasText: TITLE })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  // Chữ khớp được tô sáng bằng <mark>.
  await expect(page.getByRole("listitem").filter({ hasText: TITLE }).locator("mark").first()).toBeVisible();
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("listitem").filter({ hasText: TITLE }).getByRole("link").first().click();
  await expect(page).toHaveURL(detail);

  // In phiếu: tải về PDF đặt tên theo số chứng từ, trang chi tiết giữ nguyên.
  const docNo = (await page.locator(".ant-page-header-heading-title").innerText()).match(/PR-\d{4}-\d+/)![0];
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "In phiếu" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${docNo}.pdf`);
  expect((await readFile((await download.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByText(/Đã tải phiếu/)).toBeVisible();
  await expect(page).toHaveURL(detail);

  // Sơ đồ quy trình: đang chờ duyệt nên bước duyệt được tô sáng; watermark bpmn.io còn nguyên.
  await page.getByRole("button", { name: "Sơ đồ quy trình" }).click();
  await expect(page).toHaveURL(/\/p\/process\//);
  await expect(page.locator(".bamboo-bpmn svg").first()).toBeVisible();
  await expect(page.locator('.bamboo-active[data-element-id="approveStep"]')).toBeVisible();
  await expect(page.locator(".bjs-powered-by")).toBeVisible();
  await expect(page.getByText("Các bước duyệt")).toBeVisible();
  await expect(page.getByText(/Trưởng phòng/).first()).toBeVisible();
});

test("tìm kiếm không trả chứng từ của tenant khác", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.locator("#username").fill("kiemnhiem");
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await page.getByRole("button", { name: /Bệnh viện X/ }).click();
  await expect(page.locator("header").getByText("Bệnh viện X")).toBeVisible();
  await page.goto("/i/search?q=linh%20kien");
  await expect(page.getByText(/Không tìm thấy kết quả/)).toBeVisible();
});
