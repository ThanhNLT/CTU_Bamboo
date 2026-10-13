// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { Alert, Modal, Table } from "antd"; // Ant Design
import { Download } from "lucide-react"; // Lucide React

// ===== Module nội bộ =====
import { MODAL_Z } from "./zIndex";
import { smallSecondaryButtonClass } from "../../../components/ui";
import { downloadCsv, type AccountResult } from "./api";

// ===== Component =====
/**
 * Kết quả tạo tài khoản: mật khẩu tạm chỉ hiện MỘT lần (máy chủ không lưu bản rõ) — tải CSV để bàn giao.
 * Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
 */
export const AccountsResult = ({
  results,
  names,
  onClose,
}: {
  results: AccountResult[] | null;
  /** person_id → họ tên để hiển thị. */
  names: Record<string, string>;
  onClose: () => void;
}) => {
  const ok = (results ?? []).filter((r) => !r.error);
  return (
    <Modal
      open={Boolean(results)}
      title="Tài khoản đăng nhập"
      onCancel={onClose}
      onOk={onClose}
      okText="Đã lưu, đóng"
      cancelButtonProps={{ style: { display: "none" } }}
      width={640}
      maskClosable={false}
      zIndex={MODAL_Z}
    >
      <Alert
        type="warning"
        showIcon
        className="mb-3"
        message="Mật khẩu tạm chỉ hiện một lần"
        description="Tải danh sách về và bàn giao riêng cho từng người. Họ phải đổi mật khẩu ở lần đăng nhập đầu."
      />
      <Table
        size="small"
        rowKey="person_id"
        pagination={false}
        dataSource={results ?? []}
        columns={[
          { title: "Họ tên", render: (_, r) => names[r.person_id] ?? r.person_id },
          {
            title: "Tên đăng nhập",
            dataIndex: "username",
            render: (v: string) => <span className="font-mono text-[12px]">{v}</span>,
          },
          {
            title: "Mật khẩu tạm / lỗi",
            render: (_, r) =>
              r.error ? (
                <span className="text-red-700">{r.error}</span>
              ) : r.temporary_password ? (
                <span className="font-mono text-[12px]">{r.temporary_password}</span>
              ) : (
                <span className="text-muted">Đã liên kết tài khoản sẵn có</span>
              ),
          },
        ]}
      />
      {ok.length > 0 && (
        <button
          type="button"
          className={`${smallSecondaryButtonClass} mt-3`}
          onClick={() =>
            downloadCsv("tai-khoan-moi.csv", [
              ["Họ tên", "Tên đăng nhập", "Mật khẩu tạm"],
              ...ok.map((r) => [names[r.person_id] ?? r.person_id, r.username, r.temporary_password ?? ""]),
            ])
          }
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Tải danh sách (CSV)
        </button>
      )}
    </Modal>
  );
};
