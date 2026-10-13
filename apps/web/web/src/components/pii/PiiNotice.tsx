// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Nhãn cho biết dữ liệu đã được che (UI-06: bảo mật phải thấy được, ADR #43).

// ===== Thư viện =====
import { Tag, Tooltip } from "antd"; // Ant Design
import { EyeInvisibleOutlined } from "@ant-design/icons"; // Ant Design Icons

// ===== Component =====
export const PiiNotice = ({ labels }: { labels: string[] }) =>
  labels.length === 0 ? null : (
    <Tooltip title="Đã che dữ liệu cá nhân theo chính sách pii-guard (Presidio) của tenant">
      <Tag icon={<EyeInvisibleOutlined />} color="purple">
        Đã che: {labels.join(", ")}
      </Tag>
    </Tooltip>
  );
