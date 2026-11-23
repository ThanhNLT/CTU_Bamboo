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

import { cn } from "../../../utils/cn";

const W = 240;
const H = 44;
const PAD = 4;

export const Sparkline = ({
  data,
  threshold,
  label,
  className,
}: {
  data: number[];
  threshold?: number;
  label: string;
  className?: string;
}) => {
  if (data.length < 2) return null;
  const domain = threshold == null ? data : [...data, threshold];
  const min = Math.min(...domain);
  const span = Math.max(...domain) - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const path = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("block h-11 w-full overflow-visible", className)}
    >
      {threshold != null && (
        <line
          x1={0}
          x2={W}
          y1={y(threshold)}
          y2={y(threshold)}
          className="stroke-muted/60"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={path}
        fill="none"
        className="stroke-bamboo-600"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
