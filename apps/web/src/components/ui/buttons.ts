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

const base =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-[18px] text-[13.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:opacity-50";

export const secondaryButtonClass = `${base} border border-[var(--glass-card-edge)] bg-[var(--glass-card)] font-medium text-ink shadow-card backdrop-blur-xl hover:bg-bamboo-50`;

export const primaryButtonClass = `${base} bg-bamboo-600 font-semibold text-white shadow-glass-active hover:bg-[#2a6e38] active:scale-[0.98]`;

const small =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bamboo-500 disabled:cursor-not-allowed disabled:opacity-50";

export const smallSecondaryButtonClass = `${small} border border-line bg-canvas font-medium text-ink hover:bg-bamboo-50`;

export const smallPrimaryButtonClass = `${small} bg-bamboo-600 font-semibold text-white shadow-glass-active hover:bg-[#2a6e38]`;
