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

import { App, Input, Modal, Select } from "antd";
import { useEffect, useState } from "react";

import { tr } from "../../../i18n";
import { createGroup, openDirect, searchPeople } from "../api";
import type { Person } from "../types";

export const PeoplePicker = ({
  me,
  value,
  onChange,
  exclude = [],
}: {
  me: string;
  value: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) => {
  const [options, setOptions] = useState<Person[]>([]);
  const [known, setKnown] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const skip = exclude.join(",");

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(q, me).then((rows) => {
        if (!alive) return;
        setOptions(rows.filter((r) => !skip.includes(r.id)));
        setKnown((prev) => {
          const next = new Map(prev);
          rows.forEach((r) => next.set(r.id, r.full_name));
          return next;
        });
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, me, skip]);

  return (
    <Select
      mode="multiple"
      className="w-full"
      showSearch
      filterOption={false}
      value={value}
      onSearch={setQ}
      onChange={onChange}
      placeholder={tr("Gõ tên đồng nghiệp")}
      options={[
        ...options.map((p) => ({ value: p.id, label: p.full_name })),
        ...value.filter((v) => !options.some((o) => o.id === v)).map((v) => ({ value: v, label: known.get(v) ?? v })),
      ]}
    />
  );
};

export const NewConversation = ({
  open,
  me,
  onClose,
  onOpened,
}: {
  open: boolean;
  me: string;
  onClose: () => void;
  onOpened: (id: string) => void;
}) => {
  const { message } = App.useApp();
  const [people, setPeople] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const group = people.length > 1;

  useEffect(() => {
    if (open) {
      setPeople([]);
      setTitle("");
    }
  }, [open]);

  const ok = async () => {
    setBusy(true);
    try {
      const id = group ? await createGroup(title.trim(), people) : await openDirect(people[0]);
      onOpened(id);
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
      onOk={() => void ok()}
      okText={group ? tr("Lập nhóm") : tr("Nhắn tin")}
      cancelText={tr("Hủy")}
      okButtonProps={{ disabled: !people.length || (group && !title.trim()), loading: busy }}
      title={tr("Tin nhắn mới")}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[12.5px] text-muted">
          {tr("Chọn một người để nhắn riêng, chọn nhiều người để lập nhóm. Kênh phòng ban có sẵn theo phân công.")}
        </p>
        <PeoplePicker me={me} value={people} onChange={setPeople} />
        {group && (
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr("Tên nhóm, ví dụ: Dự án ERP giai đoạn 2")}
            aria-label={tr("Tên nhóm")}
          />
        )}
      </div>
    </Modal>
  );
};
