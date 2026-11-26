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

import type { ReactElement } from "react";
import { Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";

import { PR_STATUS_LABEL } from "../utils/status";
import { DotLabel } from "./ui/ListCard";

const STYLE: Record<string, { color: string; icon: ReactElement }> = {
  DRAFT: { color: "default", icon: <EditOutlined /> },
  PENDING: { color: "processing", icon: <ClockCircleOutlined /> },
  RETURNED: { color: "warning", icon: <RollbackOutlined /> },
  APPROVED: { color: "success", icon: <CheckCircleOutlined /> },
  CONFIRMED: { color: "success", icon: <CheckCircleOutlined /> },
  SETTLED: { color: "success", icon: <CheckCircleOutlined /> },
  REJECTED: { color: "error", icon: <CloseCircleOutlined /> },
  CANCELLED: { color: "default", icon: <StopOutlined /> },
};

export const StatusTag = ({
  status,
  labels = PR_STATUS_LABEL,
}: {
  status: string;
  labels?: Record<string, string>;
}) => {
  const s = STYLE[status];
  return (
    <Tag color={s?.color} icon={s?.icon}>
      {labels[status] ?? status}
    </Tag>
  );
};

const DOT: Record<string, { dot: string; muted?: boolean }> = {
  DRAFT: { dot: "bg-gray-400", muted: true },
  PENDING: { dot: "bg-amber-500" },
  RETURNED: { dot: "bg-orange-500" },
  APPROVED: { dot: "bg-bamboo-500" },
  CONFIRMED: { dot: "bg-bamboo-500" },
  SETTLED: { dot: "bg-bamboo-500" },
  REJECTED: { dot: "bg-red-500" },
  CANCELLED: { dot: "bg-gray-400", muted: true },
};

/** Compact status for list tables: coloured dot + label. */
export const StatusDot = ({
  status,
  labels = PR_STATUS_LABEL,
}: {
  status: string;
  labels?: Record<string, string>;
}) => {
  const s = DOT[status] ?? { dot: "bg-gray-400" };
  return <DotLabel dot={s.dot} muted={s.muted} label={labels[status] ?? status} />;
};
