// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Button, Modal, Select } from "antd";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { tr } from "../../../i18n";
import { PeoplePicker } from "../../chat/components/NewConversation";
import { ROLE_LABEL, setMembers } from "../api";
import type { Member, Role } from "../types";

/** Thành viên và vai trò; người quản lý dự án luôn là quản lý. Nhóm nhắn tin của dự án đổi theo. */
export const MembersModal = ({
  open,
  projectId,
  managerId,
  me,
  members,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  managerId: string;
  me: string;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Member[]>([]);
  const [adding, setAdding] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(members);
      setAdding([]);
    }
  }, [open, members]);

  const save = async () => {
    setBusy(true);
    try {
      await setMembers(projectId, [
        ...rows.map((r) => ({ person_id: r.person_id, role: r.role })),
        ...adding.map((id) => ({ person_id: id, role: "MEMBER" as Role })),
      ]);
      message.success(tr("Đã lưu thành viên"));
      onSaved();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={busy}
      okText={tr("Lưu")}
      cancelText={tr("Hủy")}
      title={tr("Thành viên dự án")}
      destroyOnHidden
    >
      <ul className="m-0 mb-4 list-none p-0">
        {rows.map((m) => (
          <li
            key={m.person_id}
            className="flex items-center gap-2 border-b border-line py-2 text-[13.5px] last:border-0"
          >
            <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
            <Select<Role>
              value={m.role}
              disabled={m.person_id === managerId}
              className="w-[150px]"
              onChange={(role) =>
                setRows((prev) => prev.map((x) => (x.person_id === m.person_id ? { ...x, role } : x)))
              }
              options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
            <Button
              type="text"
              disabled={m.person_id === managerId}
              icon={<Trash2 className="h-4 w-4" />}
              aria-label={tr("Bỏ khỏi dự án")}
              onClick={() => setRows((prev) => prev.filter((x) => x.person_id !== m.person_id))}
            />
          </li>
        ))}
      </ul>
      <span className="mb-1 block text-[12.5px] font-semibold text-muted">{tr("Thêm thành viên")}</span>
      <PeoplePicker me={me} value={adding} onChange={setAdding} exclude={rows.map((r) => r.person_id)} />
    </Modal>
  );
};
