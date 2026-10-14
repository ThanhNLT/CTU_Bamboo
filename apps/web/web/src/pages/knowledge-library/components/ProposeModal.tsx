// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { App, DatePicker, Form, Input, Modal, Radio, Select } from "antd"; // Ant Design
import dayjs, { type Dayjs } from "dayjs"; // Day.js
import { useEffect, useState } from "react"; // React

// ===== Module nội bộ =====
import { request } from "../../../api/client";
import { useSession } from "../../../auth/useSession";
import { createProposal, updateProposal, type ProposalInput } from "../api";
import { CATEGORY_LABEL } from "../labels";
import type { DocCategory, DocScope } from "../types";

// ===== Kiểu dữ liệu =====
type Values = {
  title: string;
  category: DocCategory;
  scope: DocScope;
  summary?: string;
  toc?: string;
  effective_date?: Dayjs | null;
  requester_position_id: string;
};

/** Giá trị ban đầu khi sửa đề xuất nháp / bị trả về, hoặc đề xuất bản thay thế. */
export type ProposalDraft = Partial<Omit<ProposalInput, "effective_date">> & {
  id?: string;
  effective_date?: string | null;
  supersedes_title?: string;
};

// ===== Truy vấn GraphQL =====
const POSITIONS = `query MyPositions($person: uuid!) {
  core_assignment(where: {person_id: {_eq: $person}, assignment_type: {_in: ["PRIMARY", "CONCURRENT", "ACTING"]}}) {
    position_id assignment_type position { name org_unit { name } } } }`;

// ===== Component =====
/** Biểu mẫu đề xuất tài liệu: lưu nháp rồi đính kèm tệp và gửi duyệt ở trang đề xuất. */
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
          ? "Sửa đề xuất tài liệu"
          : draft?.supersedes_id
            ? `Đề xuất bản thay thế “${draft.supersedes_title ?? ""}”`
            : "Đề xuất tài liệu"
      }
      okText={draft?.id ? "Lưu" : "Lưu nháp"}
      cancelText="Hủy"
      confirmLoading={busy}
      onOk={() => void save()}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item name="title" label="Tên tài liệu" rules={[{ required: true, whitespace: true, min: 2 }]}>
          <Input placeholder="Ví dụ: Quy chế vận hành phòng sạch" />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="category" label="Loại" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(CATEGORY_LABEL) as DocCategory[]).map((c) => ({
                value: c,
                label: CATEGORY_LABEL[c],
              }))}
            />
          </Form.Item>
          <Form.Item name="effective_date" label="Ngày hiệu lực">
            <DatePicker format="DD/MM/YYYY" className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="scope" label="Phạm vi đọc" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: "company", label: "Trong công ty của tôi" },
              { value: "group", label: "Cả tập đoàn" },
            ]}
          />
        </Form.Item>
        {!draft?.id && (
          <Form.Item name="requester_position_id" label="Đơn vị ban hành (tư cách lập)" rules={[{ required: true }]}>
            <Select options={positions} />
          </Form.Item>
        )}
        <Form.Item name="summary" label="Tóm tắt">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} />
        </Form.Item>
        <Form.Item name="toc" label="Mục lục" tooltip="Mỗi dòng một mục">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder={"Phạm vi áp dụng\nQuy định chung\n…"} />
        </Form.Item>
      </Form>
      <p className="m-0 text-[12px] text-muted">
        Sau khi lưu nháp: đính kèm tệp tài liệu (PDF, DOCX…, được kiểm dịch) rồi gửi duyệt. Duyệt xong, tài liệu vào thư
        viện và tìm kiếm toàn văn được.
      </p>
    </Modal>
  );
};
