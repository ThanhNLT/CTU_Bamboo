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

    var LOCALE_KEY = "bamboo.locale";
    var NAMES = { vi: "Tiếng Việt", en: "English" };
    var language = function () {
        var select = document.getElementById("login-select-toggle");
        if (!select) return;
        var current = (root.lang || "vi").slice(0, 2);
        var choices = [];
        for (var i = 0; i < select.options.length; i++) {
            var url = select.options[i].value;
            var m = /[?&]kc_locale=([a-z]{2})/.exec(url);
            if (m) choices.push({ code: m[1], url: url });
        }
        if (choices.length < 2) return;
        choices.sort(function (a, b) {
            return a.code === "vi" ? -1 : b.code === "vi" ? 1 : 0;
        });
        try {
            localStorage.setItem(LOCALE_KEY, current);
        } catch (e) {}
        var group = document.createElement("div");
        group.className = "bb-locale";
        group.setAttribute("role", "radiogroup");
        group.setAttribute("aria-label", current === "vi" ? "Ngôn ngữ" : "Language");
        choices.forEach(function (c) {
            var button = document.createElement("button");
            button.type = "button";
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", String(c.code === current));
            button.setAttribute("lang", c.code);
            button.title = NAMES[c.code] || c.code;
            button.textContent = c.code.toUpperCase();
            button.addEventListener("click", function () {
                if (c.code === current) return;
                try {
                    localStorage.setItem(LOCALE_KEY, c.code);
                } catch (e) {}
                window.location.href = c.url;
            });
            group.appendChild(button);
        });
        var control = select.closest(".pf-v5-c-form-control") || select;
        control.style.display = "none";
        control.parentNode.insertBefore(group, control);
    };

    var ready = function () {
        language();
        mount();
        greet();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
})();
