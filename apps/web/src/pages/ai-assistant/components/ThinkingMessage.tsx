/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { AiAvatar } from "./AiMessage";

export const ThinkingMessage = ({ label }: { label: string }) => (
  <div className="flex gap-3" role="status" aria-live="polite">
    <AiAvatar />
    <div className="flex items-center gap-2 pt-1 text-[13px] text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-ui bg-bamboo-500 motion-safe:animate-bounce"
            style={{ animationDelay: `${d * 120}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  </div>
);
