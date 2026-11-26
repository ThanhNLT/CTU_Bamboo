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

import { App, Button, Card, Empty, Form, Input, InputNumber, Modal, Space, Tag, Typography } from "antd";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { decideAiSuggestion, fetchAiSuggestions, type AiSuggestion } from "./api";
import { formatAgo } from "../../utils/format";
import { tr, trf } from "../../i18n";

const KIND: Record<AiSuggestion["action"]["type"], string> = {
  return_for_info: tr("Trả lại để bổ sung"),
  project_task: tr("Tạo công việc dự án"),
  comment: tr("Bình luận"),
  notify: tr("Gửi thông báo"),
  webhook: tr("Gửi webhook"),
};

const DOC_PATH: Record<string, string> = {
  "proc.purchase_request": "/p/documents/show/",
  "ic.ic_order": "/p/ic-orders/show/",
  "hr.onboarding_request": "/h/onboarding/show/",
};

const summary = (s: AiSuggestion) => {
  const a = s.action;
  if (a.type === "return_for_info") return a.note ?? "";
  if (a.type === "project_task")
    return trf("{0} · {1} ngày · dự án {2}", [a.name ?? "", a.days ?? 0, s.project_code ?? "—"]);
  if (a.type === "comment") return a.text ?? "";
  if (a.type === "notify") return a.message ?? "";
  return tr("Gửi kết quả đánh giá tới webhook đã khai");
};

type Edits = { note?: string; name?: string; description?: string; days?: number; text?: string; message?: string };

const EditFields = ({ type }: { type: AiSuggestion["action"]["type"] }) => {
  if (type === "return_for_info")
    return (
      <Form.Item name="note" label={tr("Ghi chú trả lại")} rules={[{ required: true, whitespace: true }]}>
        <Input.TextArea rows={4} maxLength={1000} showCount />
      </Form.Item>
    );
  if (type === "project_task")
    return (
      <>
        <Form.Item name="name" label={tr("Tên công việc")} rules={[{ required: true, whitespace: true }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="description" label={tr("Mô tả")}>
          <Input.TextArea rows={3} maxLength={4000} showCount />
        </Form.Item>
        <Form.Item name="days" label={tr("Số ngày (bắt đầu hôm nay)")} rules={[{ required: true }]}>
          <InputNumber min={1} max={90} precision={0} />
        </Form.Item>
      </>
    );
  if (type === "comment")
    return (
      <Form.Item name="text" label={tr("Nội dung bình luận")} rules={[{ required: true, whitespace: true }]}>
        <Input.TextArea rows={4} maxLength={1500} showCount />
      </Form.Item>
    );
  if (type === "notify")
    return (
      <Form.Item name="message" label={tr("Nội dung thông báo")} rules={[{ required: true, whitespace: true }]}>
        <Input.TextArea rows={3} maxLength={500} showCount />
      </Form.Item>
    );
  return null;
};

const SuggestionItem = ({ s, showDoc, onDone }: { s: AiSuggestion; showDoc: boolean; onDone: () => void }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<Edits>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = async (decision: "ACCEPT" | "DISMISS", edits?: Edits) => {
    setBusy(true);
    try {
      const r = await decideAiSuggestion(s.id, decision, edits);
      if (r.status === "ACCEPTED") message.success(tr("Đã chấp nhận và thực hiện đề xuất."));
      else if (r.status === "DISMISSED") message.info(tr("Đã bỏ qua đề xuất."));
      else message.error(trf("Không thực hiện được: {0}", [r.reason ?? ""]));
      setEditing(false);
      onDone();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    const a = s.action;
    form.setFieldsValue({
      note: a.note,
      name: a.name,
      description: a.description,
      days: a.days,
      text: a.text,
      message: a.message,
    });
    setEditing(true);
  };

  const dismiss = () =>
    modal.confirm({
      title: tr("Bỏ qua đề xuất này?"),
      content: tr("Đề xuất không được thực hiện; quyết định được ghi nhật ký kiểm toán."),
      okText: tr("Bỏ qua"),
      cancelText: tr("Hủy"),
      onOk: () => finish("DISMISS"),
    });

  const docPath = s.entity_type && s.entity_id ? DOC_PATH[s.entity_type] : undefined;
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Tag color="green">{KIND[s.action.type]}</Tag>
        <span className="text-[12px] text-muted">
          {trf("Tác tử {0} · {1}", [s.agent_name, formatAgo(s.created_at)])}
        </span>
        {showDoc && s.entity_label && (
          <span className="text-[12px]">
            {docPath ? <Link to={`${docPath}${s.entity_id}`}>{s.entity_label}</Link> : s.entity_label}
          </span>
        )}
      </div>
      <Typography.Paragraph className="!mb-0 whitespace-pre-line text-[13px] text-ink">
        {summary(s)}
      </Typography.Paragraph>
      {s.assessment && <p className="m-0 text-[12px] text-muted">{trf("Nhận xét của AI: {0}", [s.assessment])}</p>}
      <Space wrap>
        <Button type="primary" size="small" loading={busy} onClick={open}>
          {tr("Xem và chấp nhận")}
        </Button>
        <Button size="small" disabled={busy} onClick={dismiss}>
          {tr("Bỏ qua")}
        </Button>
      </Space>
      <Modal
        open={editing}
        title={KIND[s.action.type]}
        okText={tr("Chấp nhận và thực hiện")}
        cancelText={tr("Hủy")}
        confirmLoading={busy}
        onCancel={() => setEditing(false)}
        onOk={() =>
          form
            .validateFields()
            .then((v) => {
              const edits = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
              return finish("ACCEPT", edits);
            })
            .catch(() => undefined)
        }
      >
        <p className="text-[12.5px] text-muted">
          {tr(
            "Hệ thống thực hiện bằng quyền của chính bạn. Sửa nội dung nếu cần; AI chỉ gợi ý, quyết định thuộc về bạn.",
          )}
        </p>
        <Form form={form} layout="vertical" requiredMark="optional">
          <EditFields type={s.action.type} />
        </Form>
      </Modal>
    </li>
  );
};

const useSuggestions = (entityType?: string, entityId?: string) => {
  const [items, setItems] = useState<AiSuggestion[] | undefined>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      setItems(await fetchAiSuggestions(entityType, entityId));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, [entityType, entityId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { items, error, load };
};

/** Thẻ "Đề xuất của AI" trên trang chứng từ: chỉ hiện khi người xem có đề xuất đang chờ. */
export const AiSuggestions = ({
  entityType,
  entityId,
  onChange,
}: {
  entityType: string;
  entityId: string;
  onChange?: () => void;
}) => {
  const { items, load } = useSuggestions(entityType, entityId);
  if (!items?.length) return null;
  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bamboo-600" aria-hidden />
          {tr("Đề xuất của AI")}
        </span>
      }
    >
      <ul className="m-0 list-none divide-y divide-line/70 p-0">
        {items.map((s) => (
          <SuggestionItem
            key={s.id}
            s={s}
            showDoc={false}
            onDone={() => {
              void load();
              onChange?.();
            }}
          />
        ))}
      </ul>
    </Card>
  );
};

/** Danh sách "Đề xuất AI của tôi" (đang chờ) cho hộp việc. */
export const AiSuggestionList = () => {
  const { items, error, load } = useSuggestions();
  if (error) return null;
  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bamboo-600" aria-hidden />
          {trf("Đề xuất AI của tôi ({0})", [items?.length ?? 0])}
        </span>
      }
    >
      {items?.length ? (
        <ul className="m-0 list-none divide-y divide-line/70 p-0">
          {items.map((s) => (
            <SuggestionItem key={s.id} s={s} showDoc onDone={() => void load()} />
          ))}
        </ul>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr("Không có đề xuất AI nào chờ bạn.")} />
      )}
    </Card>
  );
};
