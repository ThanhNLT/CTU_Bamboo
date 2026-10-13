// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import type { ReactElement } from "react"; // React
import { Tag } from "antd"; // Ant Design
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons"; // Ant Design Icons

// ===== Module nội bộ =====
import { PR_STATUS_LABEL } from "../utils/status";

// ===== Hằng số =====
// Trạng thái luôn có chữ và biểu tượng, không truyền nghĩa chỉ bằng màu (UI-10).
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

// ===== Component =====
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
