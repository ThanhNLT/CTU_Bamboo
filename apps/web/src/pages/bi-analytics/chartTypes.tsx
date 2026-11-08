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
