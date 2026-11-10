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
  await expect(english.getByText("Document drive")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await english.getByRole("link", { name: "Records" }).click();
  await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create record/ })).toBeVisible();
  await expect(page.getByText("Tạo hồ sơ")).toHaveCount(0);

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "Tiếng Việt" }).click();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
});
