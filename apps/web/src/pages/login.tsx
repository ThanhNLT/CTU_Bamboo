// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useLogin } from "@refinedev/core";
import { Spin } from "antd";
import { ArrowRight, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useLocale } from "../i18n";
import { LOGIN_ATTEMPT_KEY } from "../providers/auth";
import { setupStatus } from "./setup/api";
import { AuthGreeting, AuthShell } from "./setup/AuthShell";

// Hai lần tự chuyển trong khoảng này coi như vòng lặp (Keycloak báo lỗi rồi quay về): dừng và cho bấm tay
const LOOP_WINDOW_MS = 8000;

// Keycloak trả `login_required` khi chỉ hỏi "đã đăng nhập chưa" (chưa có phiên): đó là câu trả lời bình thường, không phải lỗi
const cameBackWithError = () =>
  /error=/.test(window.location.hash) && !/error=login_required/.test(window.location.hash);

const recentlyTried = () => {
  if (!cameBackWithError()) return false;
  try {
    const last = Number(sessionStorage.getItem(LOGIN_ATTEMPT_KEY) ?? 0);
    return Date.now() - last < LOOP_WINDOW_MS;
  } catch {
    return false;
  }
};

// Vào thẳng trang nhập tên đăng nhập và mật khẩu của Keycloak, không qua bước bấm nút trung gian
export const Login: React.FC = () => {
  const { mutate: login } = useLogin();
  const { t } = useLocale();
  const navigate = useNavigate();
  const started = useRef(false);
  const [manual] = useState(recentlyTried);
  // Máy chủ chưa có công ty nào thì cho chọn "Tạo công ty mới" thay vì chuyển thẳng tới trang đăng nhập (ADR #57).
  // Đã có công ty mà vẫn mở đăng ký (SETUP_OPEN_SIGNUP) thì chuyển như cũ: trang Keycloak có nút "Tạo tài khoản"
  const [setupOpen, setSetupOpen] = useState<boolean>();

  useEffect(() => {
    void setupStatus().then((s) => setSetupOpen(s.open && s.empty));
  }, []);

  useEffect(() => {
    if (manual || started.current || setupOpen !== false) return;
    started.current = true;
    try {
      sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(Date.now()));
    } catch {
      // trình duyệt chặn sessionStorage: vẫn chuyển, chỉ mất khả năng chống lặp
    }
    login({});
  }, [login, manual, setupOpen]);

  if (setupOpen) {
    return (
      <AuthShell>
        <div className="auth-card auth-card--split">
          <section className="flex flex-col justify-center gap-6 px-8 py-10 sm:px-12 md:py-16">
            <div className="space-y-2">
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">{t("Đăng nhập")}</h1>
              <p className="text-[15px] leading-relaxed text-body">
                {t("Hệ thống chưa có công ty nào. Bạn đã có tài khoản do quản trị viên cấp thì đăng nhập tại đây.")}
              </p>
            </div>
            <button type="button" className="auth-pill auth-pill--ghost w-full" onClick={() => login({})}>
              <LogIn className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {t("Đăng nhập")}
            </button>
            <p className="text-center text-[13px] text-muted">
              {t("Chưa có tài khoản?")}{" "}
              <a className="font-semibold text-ink underline underline-offset-2" href="/khoi-tao">
                {t("Tạo tài khoản")}
              </a>
            </p>
          </section>
          <AuthGreeting
            title={t("Xin chào!")}
            text={t("Tạo tài khoản cho doanh nghiệp của bạn, thêm thành viên và bắt đầu làm việc chỉ trong vài phút.")}
          >
            <button type="button" className="auth-pill auth-pill--primary" onClick={() => navigate("/khoi-tao")}>
              {t("Tạo tài khoản")}
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </AuthGreeting>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-card max-w-[420px] justify-items-center gap-4 px-8 py-12 text-center">
        {manual ? (
          <>
            <p className="text-[15px] text-body">{t("Không chuyển được tới trang đăng nhập.")}</p>
            <button type="button" className="auth-pill auth-pill--primary" onClick={() => login({})}>
              {t("Thử đăng nhập lại")}
            </button>
          </>
        ) : (
          <>
            <Spin />
            <p className="text-[14px] text-muted">{t("Đang chuyển tới trang đăng nhập…")}</p>
          </>
        )}
      </div>
    </AuthShell>
  );
};
