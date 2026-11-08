import { Alert, App, Button, Card, Col, Descriptions, Input, Row, Space, Spin, Tabs, Tag } from "antd";
import { AuditOutlined, EditOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { Attachments } from "../../components/document/Attachments";
import { Comments } from "../../components/document/Comments";
import type { ApprovalHistory, ApprovalStep, Attachment, Comment } from "../../components/document/types";
import { cancelProposal, submitProposal } from "./api";
import { ProposeModal } from "./components/ProposeModal";
import { CATEGORY_LABEL, PROPOSAL_STATUS, SCOPE_LABEL } from "./labels";
import type { DocCategory, DocScope } from "./types";
import { tr, trf } from "../../i18n";

const ENTITY = "collab.kb_document";

const DETAIL = `query KbDoc($id: uuid!) {
  collab_kb_document_by_pk(id: $id) {
    id doc_no title category scope summary toc effective_date version supersedes_id status approval_round
    requester_id requester_position_id created_at
    requester { full_name } org_unit { name }
    approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
      id round step_order status acted_at note
      position { name org_unit { name } }
      acted_by_person { full_name } on_behalf_of_person { full_name }
      tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
    }
    approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
    comments(order_by: {created_at: asc}) { id body created_at edited_at deleted_at parent_id author_id author { full_name } }
    attachments(order_by: {created_at: asc}) { id file_name content_type size_bytes status scan_result scan_engines created_at uploaded_by
      uploaded_by_person { full_name } ocr { status pages_total pages_done note error } }
  }
  wf_v_inbox(where: {entity_id: {_eq: $id}}) { task_id via_delegation }
}`;

type Doc = {
  id: string;
  doc_no: string;
  title: string;
  category: DocCategory;
  scope: DocScope;
  summary: string | null;
  toc: string[];
  effective_date: string | null;
  version: number;
  supersedes_id: string | null;
  status: string;
  approval_round: number;
  requester_id: string;
  requester_position_id: string;
  requester: { full_name: string } | null;
  org_unit: { name: string } | null;
  approval_steps: ApprovalStep[];
  approval_history: ApprovalHistory[];
  comments: Comment[];
  attachments: Attachment[];
};

export const ProposalPage = () => {
  const { id } = useParams();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [doc, setDoc] = useState<Doc | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await request<{
        collab_kb_document_by_pk: Doc | null;
        wf_v_inbox: { task_id: string; via_delegation: boolean }[];
      }>(DETAIL, { id });
      setDoc(r.collab_kb_document_by_pk);
      setTask(r.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (doc === undefined) return <Spin />;
  if (doc === null)
    return <Alert type="warning" showIcon message={tr("Không tìm thấy đề xuất hoặc bạn không có quyền xem.")} />;

  const mine = doc.requester_id === tenant.person_id;
  const editable = mine && ["DRAFT", "RETURNED"].includes(doc.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(doc.status);
  const status = PROPOSAL_STATUS[doc.status] ?? { label: doc.status, color: "default" };

  const submit = async () => {
    try {
      await submitProposal(doc.id);
      message.success(tr("Đã gửi duyệt"));
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const cancel = () => {
    let reason = "";
    modal.confirm({
      title: trf("Hủy đề xuất {0}?", [doc.doc_no]),
      content: (
        <Input.TextArea rows={3} placeholder={tr("Lý do hủy (bắt buộc)")} onChange={(e) => (reason = e.target.value)} />
      ),
      okText: tr("Hủy đề xuất"),
      okButtonProps: { danger: true },
      cancelText: tr("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(tr("Phải ghi lý do hủy"));
          throw new Error("missing reason");
        }
        await cancelProposal(doc.id, reason.trim())
          .then(load)
          .catch((e: Error) => message.error(e.message));
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/h/library" className="text-[12.5px] text-muted hover:underline">
            {tr("← Thư viện tri thức")}
          </Link>
          <h1 className="m-0 mt-1 flex items-center gap-2 text-[22px] font-semibold text-ink">
            {doc.doc_no} <Tag color={status.color}>{status.label}</Tag>
          </h1>
        </div>
        <Space wrap>
          {task && (
            <Button type="primary" icon={<AuditOutlined />} onClick={() => setActing(true)}>
              {tr("Xử lý duyệt")}
            </Button>
          )}
          {editable && (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              {tr("Sửa")}
            </Button>
          )}
          {editable && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => void submit()}>
              {tr("Gửi duyệt")}
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              {tr("Hủy đề xuất")}
            </Button>
          )}
          {doc.status === "APPROVED" && <Link to={`/h/library?doc=${doc.id}`}>{tr("Mở trong thư viện")}</Link>}
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card>
            <h2 className="m-0 text-[18px] font-semibold text-ink">{doc.title}</h2>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} className="mt-3">
              <Descriptions.Item label={tr("Loại")}>{CATEGORY_LABEL[doc.category]}</Descriptions.Item>
              <Descriptions.Item label={tr("Phạm vi")}>{SCOPE_LABEL[doc.scope]}</Descriptions.Item>
              <Descriptions.Item label={tr("Người đề xuất")}>{doc.requester?.full_name}</Descriptions.Item>
              <Descriptions.Item label={tr("Đơn vị ban hành")}>{doc.org_unit?.name}</Descriptions.Item>
              <Descriptions.Item label={tr("Hiệu lực")}>{doc.effective_date ?? "—"}</Descriptions.Item>
              <Descriptions.Item label={tr("Phiên bản")}>
                v{doc.version}
                {doc.supersedes_id ? tr(" (thay thế bản trước)") : ""}
              </Descriptions.Item>
            </Descriptions>
            {doc.summary && <p className="mt-3 whitespace-pre-line text-[13px] text-body">{doc.summary}</p>}
            {doc.toc.length > 0 && (
              <ol className="mt-2 list-decimal pl-5 text-[13px] text-body">
                {doc.toc.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            )}
            <Tabs
              className="mt-2"
              items={[
                {
                  key: "files",
                  label: trf("Tệp tài liệu ({0})", [
                    doc.attachments.filter((a) => !["REJECTED", "INFECTED"].includes(a.status)).length,
                  ]),
                  children: (
                    <Attachments
                      doc={{ id: doc.id, status: editable ? "DRAFT" : "APPROVED", attachments: doc.attachments }}
                      entityType={ENTITY}
                      me={tenant.person_id}
                      canUpload={editable}
                      onChange={() => void load()}
                      hint={tr("tệp toàn văn của tài liệu (PDF, DOCX)")}
                    />
                  ),
                },
                {
                  key: "comments",
                  label: trf("Trao đổi ({0})", [doc.comments.filter((c) => !c.deleted_at).length]),
                  children: (
                    <Comments doc={doc} entityType={ENTITY} me={tenant.person_id} onChange={() => void load()} />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <ApprovalPanel
            round={doc.approval_round}
            steps={doc.approval_steps}
            history={doc.approval_history}
            emptyHint={tr("Chưa gửi duyệt. Trưởng đơn vị ban hành duyệt đề xuất.")}
          />
        </Col>
      </Row>

      <ProposeModal
        open={editing}
        draft={{
          id: doc.id,
          title: doc.title,
          category: doc.category,
          scope: doc.scope,
          summary: doc.summary,
          toc: doc.toc,
          effective_date: doc.effective_date,
          supersedes_id: doc.supersedes_id,
          requester_position_id: doc.requester_position_id,
        }}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          message.success(tr("Đã lưu đề xuất"));
          void load();
        }}
      />
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={trf("Xử lý {0}", [doc.doc_no])}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </div>
  );
};

export default ProposalPage;
