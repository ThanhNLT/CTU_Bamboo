/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { ChartArea, ChartColumn, ChartColumnStacked, ChartLine, ChartPie, Table2 } from "lucide-react";
import type { ReactNode } from "react";

import type { ChartType } from "./types";
import { tr } from "../../i18n";

export const CHART_TYPES: { key: ChartType; label: string; icon: ReactNode }[] = [
  { key: "bar", label: tr("Cột"), icon: <ChartColumn className="h-4 w-4" /> },
  { key: "stacked", label: tr("Cột chồng"), icon: <ChartColumnStacked className="h-4 w-4" /> },
  { key: "line", label: tr("Đường"), icon: <ChartLine className="h-4 w-4" /> },
  { key: "area", label: tr("Vùng"), icon: <ChartArea className="h-4 w-4" /> },
  { key: "pie", label: tr("Tròn"), icon: <ChartPie className="h-4 w-4" /> },
  { key: "table", label: tr("Bảng"), icon: <Table2 className="h-4 w-4" /> },
];
