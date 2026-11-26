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

import { Alert, Modal, Table } from "antd";
import { Download } from "lucide-react";

import { MODAL_Z } from "./zIndex";
import { smallSecondaryButtonClass } from "../../../components/ui";
import { downloadCsv, type AccountResult } from "./api";
import { tr } from "../../../i18n";

export const AccountsResult = ({
  results,
  names,
  onClose,
}: {
  results: AccountResult[] | null;
  names: Record<string, string>;
  onClose: () => void;
}) => {
  const ok = (results ?? []).filter((r) => !r.error);
  return (
    <Modal
      open={Boolean(results)}
      title={tr("Tài khoản đăng nhập")}
      onCancel={onClose}
      onOk={onClose}
      okText={tr("Đã lưu, đóng")}
      cancelButtonProps={{ style: { display: "none" } }}
      width={640}
      maskClosable={false}
      zIndex={MODAL_Z}
    >
      <Alert
        type="warning"
        showIcon
        className="mb-3"
        message={tr("Mật khẩu tạm chỉ hiện một lần")}
        description={tr("Tải danh sách về và bàn giao riêng cho từng người. Họ phải đổi mật khẩu ở lần đăng nhập đầu.")}
      />
      <Table
        size="small"
        rowKey="person_id"
        pagination={false}
        dataSource={results ?? []}
        columns={[
          { title: tr("Họ tên"), render: (_, r) => names[r.person_id] ?? r.person_id },
          {
            title: tr("Tên đăng nhập"),
            dataIndex: "username",
            render: (v: string) => <span className="font-mono text-[12px]">{v}</span>,
          },
          {
            title: tr("Mật khẩu tạm / lỗi"),
            render: (_, r) =>
              r.error ? (
                <span className="text-red-700">{r.error}</span>
              ) : r.temporary_password ? (
                <span className="font-mono text-[12px]">{r.temporary_password}</span>
              ) : (
                <span className="text-muted">{tr("Đã liên kết tài khoản sẵn có")}</span>
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
              [tr("Họ tên"), tr("Tên đăng nhập"), tr("Mật khẩu tạm")],
              ...ok.map((r) => [names[r.person_id] ?? r.person_id, r.username, r.temporary_password ?? ""]),
            ])
          }
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> {tr(" Tải danh sách (CSV)")}
        </button>
      )}
    </Modal>
  );
};
