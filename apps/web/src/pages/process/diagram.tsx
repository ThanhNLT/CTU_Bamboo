import { useCallback, useEffect, useRef, useState } from "react";
import { useGo } from "@refinedev/core";
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { useParams } from "react-router";

import "./diagram.css";
import { request } from "../../api/client";
import { createViewer } from "../../bpmn";
import { StatusTag } from "../../components/StatusTag";
import { formatDate, STEP_STATUS } from "../../utils/format";
import { tr, trf } from "../../i18n";

const PROCESS_STATE = `
  query ProcessState($id: uuid!) {
    process_state(request_id: $id) {
      round status source process_instance_id bpmn_xml active_activity_ids completed_activity_ids
    }
    proc_purchase_request_by_pk(id: $id) {
      id doc_no title approval_round
      approval_steps(order_by: {step_order: asc}) {
        id round step_order status acted_at
        position { name org_unit { name } }
        acted_by_person { full_name }
      }
    }
  }
`;

type State = {
  round: number;
  status: string;
  source: string;
  process_instance_id: string | null;
  bpmn_xml: string;
  active_activity_ids: string[];
  completed_activity_ids: string[];
};
type Step = {
  id: string;
  round: number;
  step_order: number;
  status: string;
  acted_at: string | null;
  position: { name: string; org_unit: { name: string } } | null;
  acted_by_person: { full_name: string } | null;
};
type Pr = { id: string; doc_no: string; title: string; approval_round: number; approval_steps: Step[] };
type Picked = { id: string; type: string; name?: string };

type Canvas = { addMarker: (id: string, cls: string) => void; zoom: (level: string) => void };
type ElementRegistry = { get: (id: string) => unknown };
type EventBus = {
  on: (
    event: string,
    cb: (e: { element: { id: string; type: string; businessObject?: { name?: string } } }) => void,
  ) => void;
};

const STEP_LABEL = /\$\{stepIndex \+ 1\}\/\$\{stepCount\}/g;

const stepLabel = (steps: Step[]) => {
  const active = steps.find((x) => x.status === "ACTIVE");
  if (active) return `${active.step_order}/${steps.length}`;
  return steps.length ? `1–${steps.length}` : "…";
};

const state = (s: State, id: string) =>
  s.active_activity_ids.includes(id)
    ? tr("Đang chạy")
    : s.completed_activity_ids.includes(id)
      ? tr("Đã qua")
      : tr("Chưa tới");

export const ProcessDiagram = () => {
  const { id } = useParams();
  const go = useGo();
  const container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ state: State; pr: Pr | null }>();
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<Picked | null>(null);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const r = await request<{ process_state: State; proc_purchase_request_by_pk: Pr | null }>(PROCESS_STATE, { id });
      setData({ state: r.process_state, pr: r.proc_purchase_request_by_pk });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data || !container.current) return;
    const viewer = createViewer({ container: container.current });
    let alive = true;
    const steps = data.pr?.approval_steps.filter((x) => x.round === data.state.round) ?? [];
    viewer
      .importXML(data.state.bpmn_xml.replace(STEP_LABEL, stepLabel(steps)))
      .then(() => {
        if (!alive) return;
        const canvas = viewer.get<Canvas>("canvas");
        const registry = viewer.get<ElementRegistry>("elementRegistry");
        const mark = (ids: string[], cls: string) =>
          ids.filter((x) => registry.get(x)).forEach((x) => canvas.addMarker(x, cls));
        mark(data.state.completed_activity_ids, "bamboo-done");
        mark(data.state.active_activity_ids, "bamboo-active");
        canvas.zoom("fit-viewport");
        viewer.get<EventBus>("eventBus").on("element.click", ({ element }) => {
          if (element.type === "bpmn:Process" || element.type === "label") setPicked(null);
          else setPicked({ id: element.id, type: element.type, name: element.businessObject?.name });
        });
      })
      .catch((e: Error) => alive && setError(trf("Không hiển thị được sơ đồ: {0}", [e.message])));
    return () => {
      alive = false;
      viewer.destroy();
    };
  }, [data]);

  if (error)
    return <Alert type="error" showIcon message={error} action={<Button onClick={load}>{tr("Thử lại")}</Button>} />;
  if (!data) return <Spin />;
  const { state: s, pr } = data;
  const steps = pr?.approval_steps.filter((x) => x.round === s.round) ?? [];

  return (
    <Card
      title={
        <Space wrap>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            aria-label={tr("Về đề nghị")}
            onClick={() => go({ to: { resource: "proc_purchase_request", action: "show", id: id! } })}
          />
          <span>
            {tr("Sơ đồ quy trình ")} {pr?.doc_no}
          </span>
          <StatusTag status={s.status} />
          {s.round > 0 && (
            <Tag>
              {tr("Lần gửi ")} {s.round}
            </Tag>
          )}
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={load}>
          {tr("Tải lại")}
        </Button>
      }
    >
      {s.source !== "flowable" && s.round > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message={tr("Bộ máy quy trình chưa đồng bộ xong; trạng thái trên sơ đồ suy ra từ dữ liệu chứng từ.")}
        />
      )}
      {s.round === 0 && (
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message={tr("Đề nghị chưa gửi duyệt.")} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <div
            ref={container}
            className="bamboo-bpmn"
            role="img"
            aria-label={trf("Sơ đồ quy trình duyệt {0}", [pr?.doc_no ?? ""])}
          />
          <Space style={{ marginTop: 8 }} wrap>
            <span className="bamboo-legend bamboo-legend-active">{tr("Đang chạy")}</span>
            <span className="bamboo-legend bamboo-legend-done">{tr("Đã qua")}</span>
            <span className="bamboo-legend">{tr("Chưa tới")}</span>
            <Typography.Text type="secondary">
              {tr("Nhấn vào một bước để xem chi tiết; kéo để di chuyển, cuộn để phóng to.")}
            </Typography.Text>
          </Space>
        </Col>
        <Col xs={24} xl={7}>
          {picked && (
            <Card size="small" title={picked.name || picked.id} style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label={tr("Trạng thái")}>{state(s, picked.id)}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}
          <Card size="small" title={tr("Các bước duyệt")}>
            {steps.length === 0 ? (
              <Typography.Text type="secondary">{tr("Chưa có bước duyệt.")}</Typography.Text>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {steps.map((x) => (
                  <div
                    key={x.id}
                    className={picked?.id === "approveStep" && x.status === "ACTIVE" ? "bamboo-step-picked" : undefined}
                  >
                    <b>
                      {x.step_order}. {x.position?.name}
                    </b>{" "}
                    – {x.position?.org_unit.name}
                    <div>
                      {STEP_STATUS[x.status] ?? x.status}
                      {x.acted_by_person ? `: ${x.acted_by_person.full_name}` : ""}
                      {x.acted_at ? ` · ${formatDate(x.acted_at)}` : ""}
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default ProcessDiagram;
