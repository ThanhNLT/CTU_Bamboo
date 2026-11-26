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

import { useCallback, useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { useGo, useParsed } from "@refinedev/core";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  AuditOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  RedoOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { usePolling } from "../../live/usePolling";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { AiSuggestions } from "../../components/ai-suggestions/AiSuggestions";
import { Attachments } from "../../components/document/Attachments";
import { Comments } from "../../components/document/Comments";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay, formatMoney } from "../../utils/format";
import { MY_TASK_FOR, OB_CANCEL, OB_DETAIL, OB_RETRY, OB_REVEAL, OB_SUBMIT } from "./queries";
import { ACCOUNT_STATUS, CONTRACT_TYPE, GENDER, type Onboarding, type OnboardingPrivate } from "./types";
import { tr, trf } from "../../i18n";

const ENTITY = "hr.onboarding_request";
const COLUMNS = { xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 };
const nowrap = { whiteSpace: "nowrap" } as const;

export const OnboardingShow = () => {
  const { id } = useParsed();
  const go = useGo();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [ob, setOb] = useState<Onboarding | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [acting, setActing] = useState(false);
  const [secret, setSecret] = useState<OnboardingPrivate | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        request<{ hr_onboarding_request_by_pk: Onboarding | null }>(OB_DETAIL, { id }),
        request<{ wf_v_inbox: { task_id: string; via_delegation: boolean }[] }>(MY_TASK_FOR, { id }),
      ]);
      setOb(d.hr_onboarding_request_by_pk);
      setTask(t.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(() => void load(), 3000, ob?.account_status === "PENDING");

  if (error) return <Alert type="error" showIcon message={error} />;
  if (ob === undefined) return <Spin />;
  if (ob === null)
    return <Alert type="warning" showIcon message={tr("Không tìm thấy hồ sơ hoặc bạn không có quyền xem.")} />;

  const mine = ob.requester_id === tenant.person_id;
  const editable = mine && ["DRAFT", "RETURNED"].includes(ob.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(ob.status);
  const returnedNote =
    ob.status === "RETURNED"
      ? ob.approval_steps.find((s) => s.round === ob.approval_round && s.status === "RETURNED")?.note
      : null;
  const account = ACCOUNT_STATUS[ob.account_status];

  const run = async (doc: string, vars: Record<string, unknown>, ok: string) => {
    try {
      await request(doc, vars);
      message.success(ok);
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const cancel = () => {
    let reason = "";
    modal.confirm({
      title: trf("Hủy hồ sơ {0}?", [ob.doc_no]),
      content: (
        <Input.TextArea
          rows={3}
          placeholder={tr("Lý do hủy (bắt buộc)")}
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: tr("Hủy hồ sơ"),
      okButtonProps: { danger: true },
      cancelText: tr("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(tr("Phải ghi lý do hủy"));
          throw new Error("missing reason");
        }
        await run(OB_CANCEL, { id: ob.id, reason: reason.trim() }, tr("Đã hủy hồ sơ"));
      },
    });
  };

  const reveal = async () => {
    try {
      const r = await request<{ reveal_onboarding_private: OnboardingPrivate }>(OB_REVEAL, { id: ob.id });
      setSecret(r.reveal_onboarding_private);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const retry = () => {
    let username = ob.username ?? "";
    modal.confirm({
      title: tr("Tạo lại tài khoản đăng nhập"),
      content: (
        <Space direction="vertical" style={{ width: "100%" }}>
          {ob.account_error && <Alert type="error" message={ob.account_error} />}
          <Input
            defaultValue={username}
            addonBefore={tr("Tên đăng nhập")}
            onChange={(e) => {
              username = e.target.value;
            }}
          />
        </Space>
      ),
      okText: tr("Tạo lại"),
      onOk: () =>
        run(OB_RETRY, { id: ob.id, username: username.trim().toLowerCase() || null }, tr("Đang tạo tài khoản")),
    });
  };

  return (
    <Show
      title={
        <Space>
          {ob.doc_no}
          <StatusTag status={ob.status} />
        </Space>
      }
      headerButtons={() => (
        <Space wrap>
          {task && (
            <Button type="primary" icon={<AuditOutlined />} onClick={() => setActing(true)}>
              {tr("Xử lý duyệt")}
            </Button>
          )}
          {ob.can_read_private && (
            <Button icon={<EyeOutlined />} onClick={reveal}>
              {tr("Xem đầy đủ")}
            </Button>
          )}
          {editable && (
            <Button
              icon={<EditOutlined />}
              onClick={() => go({ to: { resource: "hr_onboarding_request", action: "edit", id: ob.id } })}
            >
              {tr("Sửa")}
            </Button>
          )}
          {editable && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => run(OB_SUBMIT, { id: ob.id }, tr("Đã gửi duyệt"))}
            >
              {tr("Gửi duyệt")}
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              {tr("Hủy")}
            </Button>
          )}
        </Space>
      )}
    >
      {returnedNote && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={tr("Bị trả về")}
          description={returnedNote}
        />
      )}
      {ob.status === "APPROVED" && (
        <Alert
          style={{ marginBottom: 16 }}
          showIcon
          type={ob.account_status === "FAILED" ? "error" : "success"}
          message={
            <Space wrap>
              <span>
                {tr("Đã tiếp nhận")}
                {ob.person?.employee_code ? trf(": mã nhân viên {0}", [ob.person.employee_code]) : ""}.
              </span>
              <Tag color={account?.color}>
                {account?.label}
                {ob.username ? `: ${ob.username}` : ""}
              </Tag>
            </Space>
          }
          description={
            ob.account_status === "FAILED"
              ? ob.account_error
              : ob.account_status === "CREATED"
                ? tr('Nhân viên đăng nhập bằng mật khẩu tạm (phòng nhân sự xem ở "Xem đầy đủ") và phải đổi ở lần đầu.')
                : undefined
          }
          action={
            ob.account_status === "FAILED" && ob.can_read_private ? (
              <Button size="small" icon={<RedoOutlined />} onClick={retry}>
                {tr("Tạo lại")}
              </Button>
            ) : undefined
          }
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={COLUMNS} title={trf("Tiếp nhận {0}", [ob.full_name])}>
            <Descriptions.Item label={tr("Giới tính")}>{ob.gender ? GENDER[ob.gender] : "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Ngày sinh")}>{formatDay(ob.date_of_birth)}</Descriptions.Item>
            <Descriptions.Item label={tr("Điện thoại")}>{ob.phone ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Email công việc")}>{ob.work_email ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Trình độ")}>{ob.education ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Chuyên ngành")}>{ob.major ?? "—"}</Descriptions.Item>
          </Descriptions>
          <Descriptions
            style={{ marginTop: 16 }}
            bordered
            size="small"
            column={COLUMNS}
            title={
              <Space>
                <LockOutlined />
                {tr("Dữ liệu cá nhân nhạy cảm (đã che)")}
              </Space>
            }
          >
            <Descriptions.Item label={tr("Số CCCD")}>
              <span style={nowrap}>{ob.national_id_masked ?? "—"}</span>
            </Descriptions.Item>
            <Descriptions.Item label={tr("Địa chỉ")}>{ob.address_masked ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Ngân hàng")}>{ob.bank_name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={tr("Số tài khoản")}>
              <span style={nowrap}>{ob.bank_account_masked ?? "—"}</span>
            </Descriptions.Item>
          </Descriptions>
          <Descriptions style={{ marginTop: 16 }} bordered size="small" column={COLUMNS} title={tr("Đề xuất bổ nhiệm")}>
            <Descriptions.Item label={tr("Vị trí")}>{ob.target_position?.name}</Descriptions.Item>
            <Descriptions.Item label={tr("Đơn vị")}>{ob.target_position?.org_unit.name}</Descriptions.Item>
            <Descriptions.Item label={tr("Ngày vào làm")}>{formatDay(ob.start_date)}</Descriptions.Item>
            <Descriptions.Item label={tr("Loại hợp đồng")}>
              {CONTRACT_TYPE[ob.contract_type] ?? ob.contract_type}
            </Descriptions.Item>
            <Descriptions.Item label={tr("Lương đề xuất")}>
              <Typography.Text strong>
                {ob.salary == null ? "—" : trf("{0}/tháng", [formatMoney(ob.salary)])}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={tr("Tên đăng nhập")}>
              <span style={nowrap}>{ob.username ?? "—"}</span>
            </Descriptions.Item>
            <Descriptions.Item label={tr("Người lập")}>
              {ob.requester?.full_name} – {ob.requester_position?.name}, {ob.org_unit?.name}
            </Descriptions.Item>
            <Descriptions.Item label={tr("Ngày lập")}>{formatDate(ob.created_at)}</Descriptions.Item>
            {ob.note && (
              <Descriptions.Item label={tr("Ghi chú")} span={2}>
                {ob.note}
              </Descriptions.Item>
            )}
          </Descriptions>
          <Card style={{ marginTop: 16 }} size="small">
            <Tabs
              items={[
                {
                  key: "files",
                  label: trf("Hồ sơ đính kèm ({0})", [ob.attachments.length]),
                  children: (
                    <Attachments
                      doc={ob}
                      entityType={ENTITY}
                      me={tenant.person_id}
                      canUpload
                      onChange={load}
                      hint={tr("CV, bằng cấp, chứng chỉ")}
                    />
                  ),
                },
                {
                  key: "comments",
                  label: trf("Trao đổi ({0})", [ob.comments.filter((c) => !c.deleted_at).length]),
                  children: <Comments doc={ob} entityType={ENTITY} me={tenant.person_id} onChange={load} />,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <AiSuggestions entityType={ENTITY} entityId={ob.id} onChange={load} />
          <ApprovalPanel
            round={ob.approval_round}
            steps={ob.approval_steps}
            history={ob.approval_history}
            emptyHint={tr(
              "Chưa gửi duyệt. Chuỗi duyệt tính từ vị trí bổ nhiệm: quản lý trực tiếp rồi giám đốc công ty.",
            )}
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={trf("Xử lý {0}", [ob.doc_no])}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
      <Modal
        open={secret !== null}
        title={
          <Space>
            <LockOutlined />
            {tr("Dữ liệu đầy đủ của ")} {ob.full_name}
          </Space>
        }
        onCancel={() => setSecret(null)}
        footer={<Button onClick={() => setSecret(null)}>{tr("Đóng")}</Button>}
        destroyOnClose
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message={tr("Lượt xem này đã được ghi vào nhật ký kiểm toán.")}
        />
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label={tr("Số CCCD")}>
            <Typography.Text copyable>{secret?.national_id ?? "—"}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={tr("Địa chỉ")}>{secret?.address ?? "—"}</Descriptions.Item>
          <Descriptions.Item label={tr("Số tài khoản")}>
            <Typography.Text copyable>{secret?.bank_account ?? "—"}</Typography.Text>
          </Descriptions.Item>
          {secret?.initial_password && (
            <Descriptions.Item label={trf("Mật khẩu tạm ({0})", [secret.username])}>
              <Typography.Text code copyable>
                {secret.initial_password}
              </Typography.Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Modal>
    </Show>
  );
};
