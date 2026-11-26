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

import { LOCALES, setLocale, useLocale } from "../i18n";
import { cn } from "../utils/cn";

export const LocaleToggle = ({ className }: { className?: string }) => {
  const { locale, t } = useLocale();
  return (
    <div
      role="radiogroup"
      aria-label={t("Ngôn ngữ")}
      className={cn("glass flex h-9 items-center gap-0.5 rounded-full border p-0.5", className)}
    >
      {LOCALES.map((l) => {
        const on = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l.code}
            title={l.label}
            onClick={() => !on && setLocale(l.code)}
            className={cn(
              "h-8 min-w-10 rounded-full px-2.5 text-[12.5px] font-semibold uppercase transition-colors",
              on ? "bg-bamboo-600 text-white shadow-sm" : "text-body hover:bg-bamboo-50",
            )}
          >
            {l.code}
          </button>
        );
      })}
    </div>
  );
};
