/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { useLogin } from "@refinedev/core";
import { Spin } from "antd";
import { ArrowRight, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useLocale } from "../i18n";
import { LOGIN_ATTEMPT_KEY } from "../providers/auth";
import { setupStatus } from "./setup/api";
import { AuthGreeting, AuthShell } from "./setup/AuthShell";

const LOOP_WINDOW_MS = 8000;

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

export const Login: React.FC = () => {
  const { mutate: login } = useLogin();
  const { t } = useLocale();
  const navigate = useNavigate();
  const started = useRef(false);
  const [manual] = useState(recentlyTried);
  const [setupOpen, setSetupOpen] = useState<boolean>();

  useEffect(() => {
    void setupStatus().then((s) => setSetupOpen(s.open && s.empty));
  }, []);

  useEffect(() => {
    if (manual || started.current || setupOpen !== false) return;
    started.current = true;
    try {
      sessionStorage.setItem(LOGIN_ATTEMPT_KEY, String(Date.now()));
    } catch {}
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
