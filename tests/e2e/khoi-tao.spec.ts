import { expect, test } from "@playwright/test";

const SETUP_URL = process.env.E2E_SETUP_URL ?? "http://localhost:8000/setup";
const STAMP = Date.now().toString().slice(-6);

test("đăng ký sử dụng: chủ sở hữu, doanh nghiệp, thiết lập nhanh có thành viên, không ký số", async ({
  page,
  request,
}) => {
  const status = await request
    .get(`${SETUP_URL}/status`)
    .then((r) => r.json())
    .catch(() => ({ empty: false }));
  test.skip(!status.empty || !status.window_open, "Máy chủ đã có công ty hoặc đã hết 24 giờ mở đăng ký");

  await page.goto("/login");
  await expect(page.getByText(/Hệ thống chưa có công ty nào/)).toBeVisible();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(/\/khoi-tao$/);

  await page.getByLabel("Họ và tên").fill("Nguyễn Văn Thử");
  await page.getByLabel("Năm sinh").fill("1985");
  await page.getByLabel("Tên đăng nhập").fill(`chu.${STAMP}`);
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  await page.getByLabel("Tên doanh nghiệp").fill("Công ty TNHH Thử nghiệm E2E");
  await page.getByLabel("Mã số thuế").fill(`0109${STAMP}`);
  await page.getByLabel("Lĩnh vực kinh doanh").fill("Thương mại");
  await page.getByLabel("Lĩnh vực kinh doanh").press("Enter");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  await page.getByRole("radio", { name: /1–10 người/ }).click();
  await expect(page.getByRole("navigation", { name: "Các bước đăng ký" }).getByText("Phòng ban")).toHaveCount(0);
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  await page.getByPlaceholder(/Mỗi dòng một họ tên/).fill(`Lê Thu Hà ${STAMP}`);
  await page.getByRole("button", { name: /Thêm vào danh sách/ }).click();
  await expect(page.getByLabel("Tên đăng nhập")).toHaveValue(/^ha\.le|^\d+\.le/);
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  await expect(page.getByRole("button", { name: /^Mua sắm/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Phê duyệt/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  await expect(page.getByText(`chu.${STAMP}`)).toBeVisible();
  await page.getByRole("button", { name: /Tạo tài khoản doanh nghiệp/ }).click();
  await expect(page.getByText("Đã tạo Công ty TNHH Thử nghiệm E2E")).toBeVisible();
  await expect(page.getByText(/Công ty chưa xác thực pháp lý/)).toBeVisible();
  await expect(page.getByText(`chu.${STAMP}`)).toBeVisible();

  await page.goto("/khoi-tao");
  await expect(page.getByText("Hệ thống đã có doanh nghiệp")).toBeVisible();
});

test("trang Thông tin công ty: công ty có từ trước chưa có chủ sở hữu", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#username").fill("cdo");
  await page.locator("#password").fill(process.env.DEMO_PASSWORD ?? "demo-password");
  await page.locator("#kc-login").click();
  await expect(page.getByText("Tập đoàn X").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByText("Thông tin công ty").click();
  await expect(page.getByRole("heading", { name: "Thông tin công ty" })).toBeVisible();
  await expect(page.getByText(/chưa có chủ sở hữu; quyền quản trị trao theo cách cũ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Lập đơn xác thực" })).toHaveCount(0);
});
