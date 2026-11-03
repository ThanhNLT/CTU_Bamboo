// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Chế độ sáng/tối của trang đăng nhập Bamboo, kèm nút mặt trăng/mặt trời cạnh ô chọn ngôn ngữ.
// Dùng chung khóa "colorMode" với ứng dụng web (apps/web/src/contexts/color-mode): qua cổng API cùng một origin
// nên chọn ở đâu thì nơi kia theo. Thay cho script darkMode của keycloak.v2 (chỉ theo cài đặt hệ điều hành).
(function () {
    var KEY = "colorMode";
    var DARK_CLASS = "pf-v5-theme-dark";
    var root = document.documentElement;

    var read = function () {
        try {
            var saved = localStorage.getItem(KEY);
            if (saved === "light" || saved === "dark") return saved;
        } catch (e) {}
        return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    var apply = function (mode) {
        root.classList.toggle(DARK_CLASS, mode === "dark");
        root.style.colorScheme = mode;
    };

    // Áp ngay trong <head> để không nháy sai màu khi tải
    var mode = read();
    apply(mode);

    var MOON =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    var SUN =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

    var label = function () {
        var vi = (root.lang || "").indexOf("vi") === 0;
        if (mode === "dark") return vi ? "Chế độ sáng" : "Light mode";
        return vi ? "Chế độ tối" : "Dark mode";
    };

    var render = function (button) {
        // Đang tối thì hiện mặt trời (bấm để về sáng), đang sáng thì hiện mặt trăng
        button.innerHTML = mode === "dark" ? SUN : MOON;
        button.setAttribute("aria-pressed", String(mode === "dark"));
        button.setAttribute("aria-label", label());
        button.title = label();
    };

    var mount = function () {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "bb-theme-toggle";
        render(button);
        button.addEventListener("click", function () {
            mode = mode === "dark" ? "light" : "dark";
            try {
                localStorage.setItem(KEY, mode);
            } catch (e) {}
            apply(mode);
            render(button);
        });

        // Cạnh ô chọn ngôn ngữ; trang không có ô ngôn ngữ thì tạo hàng tiện ích dưới tiêu đề
        var utilities = document.querySelector(".pf-v5-c-login__main-header-utilities");
        if (!utilities) {
            var header = document.querySelector(".pf-v5-c-login__main-header");
            if (!header) return;
            utilities = document.createElement("div");
            utilities.className = "pf-v5-c-login__main-header-utilities";
            header.appendChild(utilities);
        }
        utilities.classList.add("bb-utilities");
        utilities.appendChild(button);
    };

    // Nửa lời chào bên phải ô đăng nhập (ADR #62), cùng bố cục với trang /login của ứng dụng web.
    // Keycloak đi qua cổng API cùng origin với web nên hỏi được /setup/status: còn mở đăng ký thì hiện nút "Tạo tài khoản".
    var greet = function () {
        var main = document.querySelector(".pf-v5-c-login__main");
        if (!main || !document.getElementById("kc-form-login")) return;
        var vi = (root.lang || "vi").indexOf("en") !== 0;
        var aside = document.createElement("aside");
        aside.className = "bb-greeting";
        var title = document.createElement("h2");
        title.textContent = vi ? "Xin chào!" : "Hello, friend!";
        var text = document.createElement("p");
        text.textContent = vi
            ? "Đăng nhập bằng tài khoản công ty đã cấp cho bạn. Chưa có tài khoản thì nhờ quản trị viên công ty tạo."
            : "Sign in with the company account you were given. No account yet? Ask your company administrator.";
        aside.appendChild(title);
        aside.appendChild(text);
        main.appendChild(aside);
        root.classList.add("bb-split");
        if (!window.fetch) return;
        fetch("/setup/status", { credentials: "omit" })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (s) {
                if (!s || !s.open) return;
                text.textContent = vi
                    ? "Tạo tài khoản cho doanh nghiệp của bạn, thêm thành viên và bắt đầu làm việc chỉ trong vài phút."
                    : "Create an account for your business, add your team and get started in minutes.";
                var link = document.createElement("a");
                link.className = "bb-pill";
                link.href = "/khoi-tao";
                link.textContent = vi ? "Tạo tài khoản →" : "Create account →";
                aside.appendChild(link);
            })
            .catch(function () {});
    };

    var ready = function () {
        mount();
        greet();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
})();
