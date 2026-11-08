import { Tag, Tooltip } from "antd";
import { EyeInvisibleOutlined } from "@ant-design/icons";
import { tr } from "../../i18n";

export const PiiNotice = ({ labels }: { labels: string[] }) =>
  labels.length === 0 ? null : (
    <Tooltip title={tr("Đã che dữ liệu cá nhân theo chính sách pii-guard (Presidio) của tenant")}>
      <Tag icon={<EyeInvisibleOutlined />} color="purple">
        {tr("Đã che: ")} {labels.join(", ")}
      </Tag>
    </Tooltip>
  );
