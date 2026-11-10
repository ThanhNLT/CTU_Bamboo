/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Show } from "@refinedev/antd";
import { useParsed } from "@refinedev/core";
import { Alert, App, Button, Col, Descriptions, Row, Select, Space, Spin } from "antd";
import { AuditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import { request } from "../../api/client";
import { ActModal } from "../../components/approval/ActModal";
import { ApprovalPanel } from "../../components/approval/ApprovalPanel";
import { StatusTag } from "../../components/StatusTag";
import { formatDay } from "../../utils/format";
import { isVacantFrom } from "./vacancy";
import { TRG_DETAIL, TRI_CHOOSE, TRI_DETAIL, TR_MY_TASK_FOR, TR_TARGET_POSITIONS } from "./queries";
import type { LegTransfer } from "./types";
import { tr as trl, trf } from "../../i18n";

const COLUMNS = { xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 };

type LegKind = "in" | "group";

type TargetPosition = { id: string; name: string; assignments: { valid_period: string }[] };

export const TransferLegShow = ({ kind }: { kind: LegKind }) => {
  const { id } = useParsed();
  const { message } = App.useApp();
  const [tr, setTr] = useState<LegTransfer | null>();
  const [task, setTask] = useState<{ task_id: string; via_delegation: boolean } | null>(null);
  const [positions, setPositions] = useState<TargetPosition[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const query = kind === "in" ? TRI_DETAIL : TRG_DETAIL;
      const key = kind === "in" ? "hr_transfer_in_by_pk" : "hr_transfer_group_by_pk";
      const [d, t] = await Promise.all([
        request<Record<string, LegTransfer | null>>(query, { id }),
        request<{ wf_v_inbox: { task_id: string; via_delegation: boolean }[] }>(TR_MY_TASK_FOR, { id }),
      ]);
      setTr(d[key]);
      setTask(t.wf_v_inbox[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosing = Boolean(
    kind === "in" &&
    tr &&
    task &&
    tr.status === "PENDING" &&
    !tr.target_position_id &&
    tr.approval_steps.some((s) => s.status === "ACTIVE" && s.step_order === 1),
  );

  useEffect(() => {
    if (!choosing || !tr?.target_unit_id) return;
    request<{ core_position: TargetPosition[] }>(TR_TARGET_POSITIONS, { unit: tr.target_unit_id })
      .then((r) => setPositions(r.core_position.filter((p) => isVacantFrom(p.assignments, dayjs(tr.effective_date)))))
      .catch((e: Error) => message.error(e.message));
  }, [choosing, tr, message]);

  const positionOptions = useMemo(() => positions.map((p) => ({ value: p.id, label: p.name })), [positions]);

  if (error) return <Alert type="error" showIcon message={error} />;
  if (tr === undefined) return <Spin />;
  if (tr === null)
    return <Alert type="warning" showIcon message={trl("Không tìm thấy chứng từ hoặc bạn không có quyền xem.")} />;

  const title = kind === "in" ? trl("Tiếp nhận điều chuyển") : trl("Quyết định điều chuyển liên tập đoàn");

  const choose = async () => {
    if (!chosen) return;
    try {
      await request(TRI_CHOOSE, { id: tr.id, position: chosen });
      message.success(trl("Đã chọn vị trí tiếp nhận"));
      setChosen(undefined);
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Show
      title={
        <Space>
          {tr.doc_no}
          <StatusTag status={tr.status} />
        </Space>
      }
      headerButtons={() =>
        task && (
          <Button type="primary" disabled={choosing} icon={<AuditOutlined />} onClick={() => setActing(true)}>
            {trl("Xử lý duyệt")}
          </Button>
        )
      }
    >
      {choosing && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={trl("Chọn vị trí tiếp nhận")}
          description={trl(
            "Là trưởng đơn vị tiếp nhận, bạn chọn vị trí trống trong đơn vị cho người này trước khi duyệt.",
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
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Descriptions bordered size="small" column={COLUMNS} title={`${title}: ${tr.person_name}`}>
            <Descriptions.Item label={trl("Ngày chuyển")}>{formatDay(tr.effective_date)}</Descriptions.Item>
            {kind === "in" && (
              <>
                <Descriptions.Item label={trl("Đơn vị tiếp nhận")}>{tr.target_unit?.name}</Descriptions.Item>
                <Descriptions.Item label={trl("Vị trí tiếp nhận")}>
                  {tr.target_position?.name ?? <span style={{ color: "#999" }}>{trl("Chưa chọn")}</span>}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message={trl("Đề nghị gốc nằm ở tenant nguồn")}
            description={trl(
              "Nội dung lý do và căn cứ được xem ở tenant lập đề nghị; ở đây chỉ hiển thị các bước duyệt thuộc tenant này.",
            )}
          />
        </Col>
        <Col xs={24} xl={9}>
          <ApprovalPanel
            round={tr.approval_round}
            steps={tr.approval_steps}
            history={tr.approval_history}
            emptyHint={
              kind === "in"
                ? trl("Bước 1: trưởng đơn vị tiếp nhận; bước 2: trưởng phòng nhân sự của công ty.")
                : trl("Trưởng phòng nhân sự tập đoàn quyết định.")
            }
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
