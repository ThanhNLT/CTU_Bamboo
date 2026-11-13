/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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

import { App, DatePicker, Form, Input, Modal, Radio, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";

import { request } from "../../../api/client";
import { useSession } from "../../../auth/useSession";
import { createProposal, updateProposal, type ProposalInput } from "../api";
import { CATEGORY_LABEL } from "../labels";
import type { DocCategory, DocScope } from "../types";
import { tr, trf } from "../../../i18n";

type Values = {
  title: string;
  category: DocCategory;
  scope: DocScope;
  summary?: string;
  toc?: string;
  effective_date?: Dayjs | null;
  requester_position_id: string;
};

export type ProposalDraft = Partial<Omit<ProposalInput, "effective_date">> & {
  id?: string;
  effective_date?: string | null;
  supersedes_title?: string;
};

const POSITIONS = `query MyPositions($person: uuid!) {
  core_assignment(where: {person_id: {_eq: $person}, assignment_type: {_in: ["PRIMARY", "CONCURRENT", "ACTING"]}}) {
    position_id assignment_type position { name org_unit { name } } } }`;

export const ProposeModal = ({
  open,
  draft,
  onClose,
  onSaved,
}: {
  open: boolean;
  draft?: ProposalDraft;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [form] = Form.useForm<Values>();
  const [positions, setPositions] = useState<{ value: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    request<{
      core_assignment: {
        position_id: string;
        assignment_type: string;
        position: { name: string; org_unit: { name: string } };
      }[];
    }>(POSITIONS, { person: tenant.person_id })
      .then((r) => {
        const opts = r.core_assignment.map((a) => ({
          value: a.position_id,
          label: `${a.position.name} – ${a.position.org_unit.name}`,
        }));
        setPositions(opts);
        if (!draft?.requester_position_id && opts[0]) form.setFieldValue("requester_position_id", opts[0].value);
      })
      .catch((e: Error) => message.error(e.message));
    form.setFieldsValue({
      title: draft?.title ?? "",
      category: draft?.category ?? "guide",
      scope: draft?.scope ?? "company",
      summary: draft?.summary ?? "",
      toc: (draft?.toc ?? []).join("\n"),
      effective_date: draft?.effective_date ? dayjs(draft.effective_date) : null,
      requester_position_id: draft?.requester_position_id,
    });
  }, [open, draft, form, message, tenant.person_id]);

  const save = async () => {
    const v = await form.validateFields();
    const data = {
      title: v.title.trim(),
      category: v.category,
      scope: v.scope,
      summary: v.summary?.trim() || null,
      toc: (v.toc ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      effective_date: v.effective_date ? v.effective_date.format("YYYY-MM-DD") : null,
      supersedes_id: draft?.supersedes_id ?? null,
    };
    setBusy(true);
    try {
      if (draft?.id) {
        await updateProposal(draft.id, data);
        onSaved(draft.id);
      } else {
        onSaved(await createProposal({ ...data, requester_position_id: v.requester_position_id }));
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        draft?.id
          ? tr("Sửa đề xuất tài liệu")
          : draft?.supersedes_id
            ? trf("Đề xuất bản thay thế “{0}”", [draft.supersedes_title ?? ""])
            : tr("Đề xuất tài liệu")
      }
      okText={draft?.id ? tr("Lưu") : tr("Lưu nháp")}
      cancelText={tr("Hủy")}
      confirmLoading={busy}
      onOk={() => void save()}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item name="title" label={tr("Tên tài liệu")} rules={[{ required: true, whitespace: true, min: 2 }]}>
          <Input placeholder={tr("Ví dụ: Quy chế vận hành phòng sạch")} />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="category" label={tr("Loại")} rules={[{ required: true }]}>
            <Select
              options={(Object.keys(CATEGORY_LABEL) as DocCategory[]).map((c) => ({
                value: c,
                label: CATEGORY_LABEL[c],
              }))}
            />
          </Form.Item>
          <Form.Item name="effective_date" label={tr("Ngày hiệu lực")}>
            <DatePicker format="DD-MMM-YYYY" className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="scope" label={tr("Phạm vi đọc")} rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: "company", label: tr("Trong công ty của tôi") },
              { value: "group", label: tr("Cả tập đoàn") },
            ]}
          />
        </Form.Item>
        {!draft?.id && (
          <Form.Item
            name="requester_position_id"
            label={tr("Đơn vị ban hành (tư cách lập)")}
            rules={[{ required: true }]}
          >
            <Select options={positions} />
          </Form.Item>
        )}
        <Form.Item name="summary" label={tr("Tóm tắt")}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} />
        </Form.Item>
        <Form.Item name="toc" label={tr("Mục lục")} tooltip={tr("Mỗi dòng một mục")}>
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 10 }}
            placeholder={tr("Phạm vi áp dụng\nQuy định chung\n…")}
          />
        </Form.Item>
      </Form>
      <p className="m-0 text-[12px] text-muted">
        {tr(
          "Sau khi lưu nháp: đính kèm tệp tài liệu (PDF, DOCX…, được kiểm dịch) rồi gửi duyệt. Duyệt xong, tài liệu vào thư viện và tìm kiếm toàn văn được.",
        )}
      </p>
    </Modal>
  );
};
