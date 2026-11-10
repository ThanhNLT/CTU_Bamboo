/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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
