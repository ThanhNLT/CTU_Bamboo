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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Show } from "@refinedev/antd";
import { useParsed } from "@refinedev/core";
import { Alert, App, Button, Col, Descriptions, Input, Row, Select, Space, Spin } from "antd";
import dayjs from "dayjs";
import { AuditOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, formatDay } from "../../utils/format";
import { isVacantFrom } from "./vacancy";
import { REQUESTER_KIND, type Transfer } from "./types";
import { TR_CANCEL, TR_CHOOSE, TR_DETAIL, TR_MY_TASK_FOR, TR_SUBMIT, TR_TARGET_POSITIONS } from "./queries";
import { tr as trl, trf } from "../../i18n";

const COLUMNS = { xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 };

type TargetPosition = {
  id: string;
  name: string;
  assignments: { valid_period: string }[];
};

export const TransferShow = () => {
  const { id } = useParsed();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [tr, setTr] = useState<Transfer | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [positions, setPositions] = useState<TargetPosition[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        request<{ hr_transfer_request_by_pk: Transfer | null }>(TR_DETAIL, { id }),
        request<{ wf_v_inbox: { task_id: string; via_delegation: boolean }[] }>(TR_MY_TASK_FOR, { id }),
      ]);
      setTr(d.hr_transfer_request_by_pk);
      setTask(t.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosing = Boolean(
    tr &&
    task &&
    tr.status === "PENDING" &&
    !tr.target_position_id &&
    tr.approval_steps.some((s) => s.status === "ACTIVE" && s.step_order === 1),
  );

  useEffect(() => {
    if (!choosing || !tr) return;
    request<{ core_position: TargetPosition[] }>(TR_TARGET_POSITIONS, { unit: tr.target_unit_id })
      .then((r) => setPositions(r.core_position.filter((p) => isVacantFrom(p.assignments, dayjs(tr.effective_date)))))
      .catch((e: Error) => message.error(e.message));
  }, [choosing, tr, message]);

  const positionOptions = useMemo(() => positions.map((p) => ({ value: p.id, label: p.name })), [positions]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (tr === undefined) return <Spin />;
  if (tr === null)
    return <Alert type="warning" showIcon message={trl("Không tìm thấy đề nghị hoặc bạn không có quyền xem.")} />;

  const mine = tr.requester_id === tenant.person_id;
  const submittable = mine && ["DRAFT", "RETURNED"].includes(tr.status);
  const cancellable = mine && ["DRAFT", "PENDING", "RETURNED"].includes(tr.status);
  const returnedNote =
    tr.status === "RETURNED"
      ? tr.approval_steps.find((s) => s.round === tr.approval_round && s.status === "RETURNED")?.note
      : null;

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
      title: trf("Hủy đề nghị {0}?", [tr.doc_no]),
      content: (
        <Input.TextArea
          rows={3}
          placeholder={trl("Lý do hủy (bắt buộc)")}
          onChange={(e) => {
            reason = e.target.value;
          }}
        />
      ),
      okText: trl("Hủy đề nghị"),
      okButtonProps: { danger: true },
      cancelText: trl("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(trl("Phải ghi lý do hủy"));
          throw new Error("missing reason");
        }
        await run(TR_CANCEL, { id: tr.id, reason: reason.trim() }, trl("Đã hủy đề nghị"));
      },
    });
  };

  const choose = async () => {
    if (!chosen) return;
    await run(TR_CHOOSE, { id: tr.id, position: chosen }, trl("Đã chọn vị trí tiếp nhận"));
    setChosen(undefined);
  };

  return (
    <Show
      title={
        <Space>
          {tr.doc_no}
          <StatusTag status={tr.status} />
        </Space>
      }
      headerButtons={() => (
        <Space wrap>
          {task && (
            <Button type="primary" disabled={choosing} icon={<AuditOutlined />} onClick={() => setActing(true)}>
              {trl("Xử lý duyệt")}
            </Button>
          )}
          {submittable && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => run(TR_SUBMIT, { id: tr.id }, trl("Đã gửi duyệt"))}
            >
              {trl("Gửi duyệt")}
            </Button>
          )}
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={cancel}>
              {trl("Hủy")}
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
          message={trl("Bị trả về")}
          description={returnedNote}
        />
      )}
      {choosing && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={trl("Chọn vị trí tiếp nhận")}
          description={trl(
            "Là trưởng đơn vị tiếp nhận, bạn chọn vị trí trong đơn vị cho nhân viên này trước khi duyệt.",
          )}
          action={
            <Space.Compact>
              <Select
                style={{ width: 240 }}
                placeholder={trl("Chọn vị trí trống")}
                value={chosen}
                onChange={setChosen}
                options={positionOptions}
                showSearch
                optionFilterProp="label"
              />
              <Button type="primary" disabled={!chosen} onClick={choose}>
                {trl("Lưu vị trí")}
              </Button>
            </Space.Compact>
          }
        />
      )}
      {tr.status === "APPROVED" && (
        <Alert
          style={{ marginBottom: 16 }}
          type="success"
          showIcon
          message={trf("Đã điều chuyển đến {0}, {1} từ {2}", [
            tr.target_position?.name ?? "",
            tr.target_unit?.name ?? "",
            formatDay(tr.effective_date),
          ])}
        />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions
            bordered
            size="small"
            column={COLUMNS}
            title={trf("Điều chuyển {0}", [tr.person?.full_name ?? ""])}
          >
            <Descriptions.Item label={trl("Mã nhân viên")}>{tr.person?.employee_code ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={trl("Ngày chuyển")}>{formatDay(tr.effective_date)}</Descriptions.Item>
            <Descriptions.Item label={trl("Vị trí hiện tại")}>
              {tr.source_position?.name}, {tr.source_position?.org_unit.name}
            </Descriptions.Item>
            <Descriptions.Item label={trl("Đơn vị tiếp nhận")}>{tr.target_unit?.name}</Descriptions.Item>
            <Descriptions.Item label={trl("Vị trí tiếp nhận")}>
              {tr.target_position?.name ?? <span style={{ color: "#999" }}>{trl("Chưa chọn")}</span>}
            </Descriptions.Item>
            <Descriptions.Item label={trl("Người lập")}>
              {tr.requester?.full_name} – {tr.requester_position?.name}
              <br />
              {REQUESTER_KIND[tr.requester_kind]}
            </Descriptions.Item>
            <Descriptions.Item label={trl("Ngày lập")}>{formatDate(tr.created_at)}</Descriptions.Item>
            <Descriptions.Item label={trl("Lý do / nguyện vọng")} span={2}>
              {tr.reason}
            </Descriptions.Item>
          </Descriptions>
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={tr.approval_round}
            steps={tr.approval_steps}
            history={tr.approval_history}
            emptyHint={trl(
              "Chưa gửi duyệt. Bước 1: trưởng đơn vị tiếp nhận; bước 2: trưởng phòng nhân sự của công ty.",
            )}
          />
        </Col>
      </Row>
      <ActModal
        taskId={acting ? (task?.task_id ?? null) : null}
        viaDelegation={task?.via_delegation}
        title={trf("Xử lý {0}", [tr.doc_no])}
        onClose={() => setActing(false)}
        onDone={() => {
          setActing(false);
          void load();
        }}
      />
    </Show>
  );
};
