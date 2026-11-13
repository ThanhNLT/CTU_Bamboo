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

import { Moon, Sun } from "lucide-react";
import { useContext, type ReactNode } from "react";

import { BambooLogo } from "../../components/layout/BambooLogo";
import { LocaleToggle } from "../../components/LocaleToggle";
import { ColorModeContext } from "../../contexts/color-mode/context";
import { useLocale } from "../../i18n";
import { cn } from "../../utils/cn";

export const AuthShell = ({ children, wide = false }: { children: ReactNode; wide?: boolean }) => {
  const { mode, setMode } = useContext(ColorModeContext);
  const { t } = useLocale();
  const dark = mode === "dark";
  return (
    <div className="auth-backdrop flex flex-col items-center px-4 py-6 sm:px-6 sm:py-10">
      <span className="auth-orb left-[-8%] top-[18%] h-72 w-72 bg-bamboo-300" aria-hidden />
      <span className="auth-orb bottom-[-6%] right-[8%] h-96 w-96 bg-bamboo-400 [animation-delay:-8s]" aria-hidden />
      <span className="auth-orb right-[30%] top-[-10%] h-64 w-64 bg-bamboo-200 [animation-delay:-16s]" aria-hidden />

      <header className={cn("flex w-full items-center justify-between", wide ? "max-w-[1080px]" : "max-w-[880px]")}>
        <a href="/login" className="flex items-center gap-2.5 text-ink no-underline">
          <BambooLogo className="h-8 w-8 drop-shadow-[0_4px_8px_rgb(19_58_30_/_0.25)]" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Bamboo DX-OS</span>
        </a>
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <button
            type="button"
            onClick={() => setMode(dark ? "light" : "dark")}
            aria-pressed={dark}
            aria-label={t(dark ? "Chế độ sáng" : "Chế độ tối")}
            title={t(dark ? "Chế độ sáng" : "Chế độ tối")}
            className="glass grid h-9 w-9 place-items-center rounded-full border text-body transition-transform active:scale-95"
          >
            {dark ? (
              <Sun className="h-[18px] w-[18px]" strokeWidth={2} />
            ) : (
              <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </header>

      <main
        className={cn(
          "flex w-full flex-1 items-center justify-center py-6 sm:py-10",
          wide ? "max-w-[1080px]" : "max-w-[880px]",
        )}
      >
        {children}
      </main>
    </div>
  );
};

export const AuthGreeting = ({ title, text, children }: { title: string; text: string; children?: ReactNode }) => (
  <section className="auth-greeting flex flex-col justify-center gap-4 px-8 py-10 sm:px-12 md:py-16">
    <h2 className="text-[30px] font-bold uppercase leading-[1.05] tracking-[-0.02em] text-ink sm:text-[34px]">
      {title}
    </h2>
    <p className="max-w-[22rem] text-[15px] leading-relaxed text-body">{text}</p>
    {children && <div className="pt-2">{children}</div>}
  </section>
);
