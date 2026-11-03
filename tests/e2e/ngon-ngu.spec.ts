// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";

test("đổi sang tiếng Anh cho menu và giữ lựa chọn sau khi tải lại", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill("nv.muahang.dienthoai");
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await expect(nav.getByRole("link", { name: "Thiết kế quy trình" })).toBeVisible();

  await page.getByRole("button", { name: "Ngôn ngữ" }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const english = page.getByRole("navigation", { name: "Main navigation" });
  await expect(english.getByRole("link", { name: "Process design" })).toBeVisible();
  await expect(english.getByText("Digital people")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Tiếng Việt" }).click();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
});
