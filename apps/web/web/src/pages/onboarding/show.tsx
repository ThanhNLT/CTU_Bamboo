// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Chi tiết hồ sơ tiếp nhận: người duyệt thấy thông tin công việc và dữ liệu nhạy cảm đã che; phòng nhân sự
// bấm "Xem đầy đủ" (Action reveal_onboarding_private, mỗi lần xem ghi nhật ký kiểm toán).
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
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { Attachments } from "../../components/document/Attachments";
import { Comments } from "../../components/document/Comments";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay, formatMoney } from "../../utils/format";
import { MY_TASK_FOR, OB_CANCEL, OB_DETAIL, OB_RETRY, OB_REVEAL, OB_SUBMIT } from "./queries";
import { ACCOUNT_STATUS, CONTRACT_TYPE, GENDER, type Onboarding, type OnboardingPrivate } from "./types";

const ENTITY = "hr.onboarding_request";
// Thiếu khóa nào thì antd dùng 3 cột cho cỡ màn hình đó: khai báo đủ để giữ 2 cột trên màn hình rộng.
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

  // Tài khoản đang được tạo ở nền: tải lại vài giây một lần tới khi có kết quả.
  useEffect(() => {
    if (ob?.account_status !== "PENDING") return;
    const t = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(t);
  }, [ob?.account_status, load]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (ob === undefined) return <Spin />;
  if (ob === null) return <Alert type="warning" showIcon message="Không tìm thấy hồ sơ hoặc bạn không có quyền xem." />;

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
      title: `Hủy hồ sơ ${ob.doc_no}?`,
      content: (
        <Input.TextArea
          rows={3}
          placeholder="Lý do hủy (bắt buộc)"
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: "Hủy hồ sơ",
      okButtonProps: { danger: true },
      cancelText: "Không",
      onOk: async () => {
        if (!reason.trim()) {
          message.error("Phải ghi lý do hủy");
          throw new Error("missing reason");
        }
        await run(OB_CANCEL, { id: ob.id, reason: reason.trim() }, "Đã hủy hồ sơ");
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
      title: "Tạo lại tài khoản đăng nhập",
      content: (
        <Space direction="vertical" style={{ width: "100%" }}>
          {ob.account_error && <Alert type="error" message={ob.account_error} />}
          <Input
            defaultValue={username}
            addonBefore="Tên đăng nhập"
            onChange={(e) => {
              username = e.target.value;
            }}
          />
        </Space>
      ),
      okText: "Tạo lại",
      onOk: () => run(OB_RETRY, { id: ob.id, username: username.trim().toLowerCase() || null }, "Đang tạo tài khoản"),
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
              Xử lý duyệt
            </Button>
          )}
          {ob.can_read_private && (
            <Button icon={<EyeOutlined />} onClick={reveal}>
              Xem đầy đủ
            </Button>
          )}
          {editable && (
            <Button
              icon={<EditOutlined />}
              onClick={() => go({ to: { resource: "hr_onboarding_request", action: "edit", id: ob.id } })}
            >
              Sửa
            </Button>
          )}
          {editable && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => run(OB_SUBMIT, { id: ob.id }, "Đã gửi duyệt")}
            >
              Gửi duyệt
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              Hủy
            </Button>
          )}
        </Space>
      )}
    >
      {returnedNote && (
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Bị trả về" description={returnedNote} />
      )}
      {ob.status === "APPROVED" && (
        <Alert
          style={{ marginBottom: 16 }}
          showIcon
          type={ob.account_status === "FAILED" ? "error" : "success"}
          message={
            <Space wrap>
              <span>Đã tiếp nhận{ob.person?.employee_code ? `: mã nhân viên ${ob.person.employee_code}` : ""}.</span>
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
                ? 'Nhân viên đăng nhập bằng mật khẩu tạm (phòng nhân sự xem ở "Xem đầy đủ") và phải đổi ở lần đầu.'
                : undefined
          }
          action={
            ob.account_status === "FAILED" && ob.can_read_private ? (
              <Button size="small" icon={<RedoOutlined />} onClick={retry}>
                Tạo lại
              </Button>
            ) : undefined
          }
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={COLUMNS} title={`Tiếp nhận ${ob.full_name}`}>
            <Descriptions.Item label="Giới tính">{ob.gender ? GENDER[ob.gender] : "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">{formatDay(ob.date_of_birth)}</Descriptions.Item>
            <Descriptions.Item label="Điện thoại">{ob.phone ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Email công việc">{ob.work_email ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Trình độ">{ob.education ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Chuyên ngành">{ob.major ?? "—"}</Descriptions.Item>
          </Descriptions>
          <Descriptions
            style={{ marginTop: 16 }}
            bordered
            size="small"
            column={COLUMNS}
            title={
              <Space>
                <LockOutlined />
                Dữ liệu cá nhân nhạy cảm (đã che)
              </Space>
            }
          >
            <Descriptions.Item label="Số CCCD">
              <span style={nowrap}>{ob.national_id_masked ?? "—"}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Địa chỉ">{ob.address_masked ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Ngân hàng">{ob.bank_name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Số tài khoản">
              <span style={nowrap}>{ob.bank_account_masked ?? "—"}</span>
            </Descriptions.Item>
          </Descriptions>
          <Descriptions style={{ marginTop: 16 }} bordered size="small" column={COLUMNS} title="Đề xuất bổ nhiệm">
            <Descriptions.Item label="Vị trí">{ob.target_position?.name}</Descriptions.Item>
            <Descriptions.Item label="Đơn vị">{ob.target_position?.org_unit.name}</Descriptions.Item>
            <Descriptions.Item label="Ngày vào làm">{formatDay(ob.start_date)}</Descriptions.Item>
            <Descriptions.Item label="Loại hợp đồng">
              {CONTRACT_TYPE[ob.contract_type] ?? ob.contract_type}
            </Descriptions.Item>
            <Descriptions.Item label="Lương đề xuất">
              <Typography.Text strong>{ob.salary == null ? "—" : `${formatMoney(ob.salary)}/tháng`}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tên đăng nhập">
              <span style={nowrap}>{ob.username ?? "—"}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Người lập">
              {ob.requester?.full_name} – {ob.requester_position?.name}, {ob.org_unit?.name}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày lập">{formatDate(ob.created_at)}</Descriptions.Item>
            {ob.note && (
              <Descriptions.Item label="Ghi chú" span={2}>
                {ob.note}
              </Descriptions.Item>
            )}
          </Descriptions>
          <Card style={{ marginTop: 16 }} size="small">
            <Tabs
              items={[
                {
                  key: "files",
                  label: `Hồ sơ đính kèm (${ob.attachments.length})`,
                  children: (
                    <Attachments
                      doc={ob}
                      entityType={ENTITY}
                      me={tenant.person_id}
                      canUpload
                      onChange={load}
                      hint="CV, bằng cấp, chứng chỉ"
                    />
                  ),
                },
                {
                  key: "comments",
                  label: `Trao đổi (${ob.comments.filter((c) => !c.deleted_at).length})`,
                  children: <Comments doc={ob} entityType={ENTITY} me={tenant.person_id} onChange={load} />,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={ob.approval_round}
            steps={ob.approval_steps}
            history={ob.approval_history}
            emptyHint="Chưa gửi duyệt. Chuỗi duyệt tính từ vị trí bổ nhiệm: quản lý trực tiếp rồi giám đốc công ty."
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={`Xử lý ${ob.doc_no}`}
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
            Dữ liệu đầy đủ của {ob.full_name}
          </Space>
        }
        onCancel={() => setSecret(null)}
        footer={<Button onClick={() => setSecret(null)}>Đóng</Button>}
        destroyOnClose
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="Lượt xem này đã được ghi vào nhật ký kiểm toán."
        />
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Số CCCD">
            <Typography.Text copyable>{secret?.national_id ?? "—"}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Địa chỉ">{secret?.address ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Số tài khoản">
            <Typography.Text copyable>{secret?.bank_account ?? "—"}</Typography.Text>
          </Descriptions.Item>
          {secret?.initial_password && (
            <Descriptions.Item label={`Mật khẩu tạm (${secret.username})`}>
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
