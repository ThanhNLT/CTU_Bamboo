/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const USER = process.env.E2E_PLATFORM_USER ?? "";
const PASSWORD = process.env.E2E_PLATFORM_PASSWORD ?? process.env.DEMO_PASSWORD ?? "demo-password";
const BASE_URL = process.env.E2E_EXT_BASE_URL ?? "";
const KEY_FILE = process.env.E2E_EXT_KEY_FILE ?? "";

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const nav = (page: Page) => page.getByRole("navigation", { name: "Điều hướng chính" });

test("đăng ký mô-đun ngoài, bật cho công ty, dùng trong khung nhúng rồi gỡ", async ({ page }) => {
  test.skip(!USER || !BASE_URL || !KEY_FILE, "Cần E2E_PLATFORM_USER, E2E_EXT_BASE_URL, E2E_EXT_KEY_FILE");
  await page.goto("/login");
  await page.locator("#username").fill(USER);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(nav(page)).toBeVisible();

  await page.goto("/admin/modules");
  await page.getByRole("button", { name: "Thêm mô-đun ngoài" }).click();
  const manifest = {
    code: "x_nhac_viec",
    name: "Nhắc việc",
    description: "Mô-đun mẫu gửi lời nhắc",
    vendor: "DX-OS Open-Core",
    version: "1.0.0",
    base_url: BASE_URL,
    health_path: "/healthz",
    scopes: ["people.read", "notify.send"],
    menu: [{ label: "Nhắc việc", path: "/" }],
  };
  await page.getByLabel("Manifest").fill(JSON.stringify(manifest, null, 2));
  await page.getByRole("button", { name: "Đăng ký" }).click();
  const key = (await page.locator(".ant-modal-confirm-content code").first().textContent())?.trim() ?? "";
  expect(key).toMatch(/^bmk_/);
  writeFileSync(KEY_FILE, key);
  await page.getByRole("button", { name: "OK" }).click();

  await expect(card(page, "Nhắc việc").getByText("Mô-đun ngoài")).toBeVisible();
  await card(page, "Nhắc việc").getByRole("button", { name: "Bật" }).click();
  await expect(page.getByText("Gửi thông báo cho người trong công ty").last()).toBeVisible();
  await page.getByRole("button", { name: "Bật", exact: true }).last().click();
  await expect(page.getByText(/Đã bật Nhắc việc/)).toBeVisible();

  await nav(page).getByText("Nhắc việc").click();
  await expect(page).toHaveURL(/\/x\/x_nhac_viec$/);
  const frame = page.frameLocator('iframe[title="Nhắc việc"]');
  await expect(frame.getByText("Xin chào")).toBeVisible();
  await frame.getByRole("button", { name: "Gửi lời nhắc" }).click();
  await expect(frame.getByText("Đã gửi lời nhắc.")).toBeVisible();

  const isolated = await page
    .frames()
    .find((f) => f.url().includes("/ext/x_nhac_viec/"))
    ?.evaluate(() => {
      try {
        return window.localStorage.getItem("bamboo.tenant") === null && window.origin === "null";
      } catch {
        return true;
      }
    });
  expect(isolated).toBe(true);

  await page.goto("/admin/modules");
  await card(page, "Nhắc việc").getByRole("button", { name: "Tắt" }).click();
  await page.getByRole("button", { name: "Tắt", exact: true }).last().click();
  await expect(page.getByText(/Đã tắt Nhắc việc/)).toBeVisible();
  await expect(nav(page).getByText("Nhắc việc")).toHaveCount(0);
  await card(page, "Nhắc việc").getByRole("button", { name: "Gỡ khỏi máy" }).click();
  await page.getByRole("button", { name: "Gỡ khỏi máy", exact: true }).last().click();
  await expect(card(page, "Nhắc việc")).toHaveCount(0);
});
