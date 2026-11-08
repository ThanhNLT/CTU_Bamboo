import { App, Button, DatePicker, Empty, Form, Input, Modal, Radio } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { FileDown, Plus } from "lucide-react";
import { useState } from "react";

import { Panel } from "../../../components/ui";
import { tr, trf } from "../../../i18n";
import { cn } from "../../../utils/cn";
import { createReport, HEALTH_LABEL, HEALTH_STYLE, reportPdf } from "../api";
import type { Health, Report, Stats } from "../types";

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

type Values = {
  period: [Dayjs, Dayjs];
  health: Health;
  summary: string;
  accomplishments?: string;
  issues?: string;
  next_steps?: string;
};

/** Báo cáo tiến độ theo kỳ: lập (chụp số liệu lúc lập, không sửa), xem lịch sử, in PDF. */
export const Reports = ({
  projectId,
  reports,
  stats,
  canManage,
  onCreated,
}: {
  projectId: string;
  reports: Report[];
  stats: Stats;
  canManage: boolean;
  onCreated: () => void;
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = () => {
    const from = reports[0] ? dayjs(reports[0].period_to).add(1, "day") : dayjs().subtract(6, "day");
    form.setFieldsValue({ period: [from, dayjs()], health: stats.suggested_health });
    setOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try {
      await createReport({
        project_id: projectId,
        period_from: v.period[0].format("YYYY-MM-DD"),
        period_to: v.period[1].format("YYYY-MM-DD"),
        health: v.health,
        summary: v.summary,
        accomplishments: v.accomplishments || null,
        issues: v.issues || null,
        next_steps: v.next_steps || null,
      });
      message.success(tr("Đã lập báo cáo, thành viên dự án nhận thông báo"));
      setOpen(false);
      form.resetFields();
      onCreated();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pdf = async (id: string) => {
    try {
      window.open(await reportPdf(id), "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Panel
      title={tr("Báo cáo tiến độ")}
      extra={
        canManage && (
          <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={start}>
            {tr("Lập báo cáo kỳ này")}
          </Button>
        )
      }
    >
      {reports.length === 0 ? (
        <Empty description={tr("Chưa có báo cáo tiến độ")} />
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">
                  {trf("Kỳ {0} – {1}", [dayjs(r.period_from).format("DD/MM"), dayjs(r.period_to).format("DD/MM/YYYY")])}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", HEALTH_STYLE[r.health])}>
                  {HEALTH_LABEL[r.health]}
                </span>
                <span className="text-[12px] text-muted">
                  {trf("Thực hiện {0} / kế hoạch {1}", [pct(r.actual_pct), pct(r.planned_pct)])}
                  {r.spi != null && ` · SPI ${Number(r.spi).toFixed(2)}`}
                  {r.late_tasks > 0 && ` · ${trf("{0} việc trễ", [r.late_tasks])}`}
                </span>
                <Button
                  size="small"
                  className="ml-auto"
                  icon={<FileDown className="h-3.5 w-3.5" />}
                  onClick={() => void pdf(r.id)}
                >
                  PDF
                </Button>
              </div>
              <p className="mb-0 mt-2 whitespace-pre-line text-[13.5px] text-body">{r.summary}</p>
              {[
                [tr("Kết quả đạt được"), r.accomplishments],
                [tr("Vướng mắc, rủi ro"), r.issues],
                [tr("Kế hoạch kỳ tới"), r.next_steps],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="mt-2 text-[13px]">
                    <span className="font-semibold text-muted">{k}: </span>
                    <span className="whitespace-pre-line text-body">{v}</span>
                  </div>
                ))}
              <p className="mb-0 mt-2 text-[11.5px] text-muted">
                {trf("{0} lập lúc {1}", [r.created_by_name, dayjs(r.created_at).format("HH:mm DD/MM/YYYY")])}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText={tr("Lập báo cáo")}
        cancelText={tr("Hủy")}
        title={tr("Báo cáo tiến độ")}
        width={640}
        destroyOnHidden
      >
        <p className="text-[12.5px] text-muted">
          {trf("Số liệu chụp lúc lập: thực hiện {0}, kế hoạch {1}, {2} việc trễ. Báo cáo đã lập không sửa được.", [
            pct(stats.actual_pct),
            pct(stats.planned_pct),
            stats.late_tasks,
          ])}
        </p>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="period" label={tr("Kỳ báo cáo")} rules={[{ required: true }]}>
            <DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="health" label={tr("Tình trạng (gợi ý theo SPI và việc trễ)")}>
            <Radio.Group
              optionType="button"
              options={(["GREEN", "AMBER", "RED"] as Health[]).map((h) => ({ value: h, label: HEALTH_LABEL[h] }))}
            />
          </Form.Item>
          <Form.Item
            name="summary"
            label={tr("Tóm tắt")}
            rules={[{ required: true, whitespace: true, message: tr("Cần tóm tắt") }]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} />
          </Form.Item>
          <Form.Item name="accomplishments" label={tr("Kết quả đạt được trong kỳ")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} />
          </Form.Item>
          <Form.Item name="issues" label={tr("Vướng mắc, rủi ro và đề xuất")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} />
          </Form.Item>
          <Form.Item name="next_steps" label={tr("Kế hoạch kỳ tới")}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
};
