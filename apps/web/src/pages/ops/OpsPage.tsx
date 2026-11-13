/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { App, Button, Input, Segmented, Select, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import { request } from "../../api/client";
import { tr, trf } from "../../i18n";

type LogEvent = { id: number; ts: string; service: string; level: string; message: string; trace_id: string | null };
type Anchor = {
  id: string;
  seq: number;
  head_hash: string;
  alg: string;
  anchored_at: string;
  published: { kind: string; ok: boolean }[];
};
type Backup = {
  id: number;
  kind: "BACKUP" | "DRILL";
  status: "OK" | "FAILED";
  location: string | null;
  size_bytes: number | null;
  detail: { problems?: string[]; error?: string; databases?: string };
  started_at: string;
  finished_at: string;
};

const LEVEL_COLOR: Record<string, string> = {
  DEBUG: "default",
  INFO: "blue",
  WARNING: "orange",
  ERROR: "red",
  CRITICAL: "magenta",
};
const mb = (b: number | null) => (b == null ? "—" : `${(b / 1024 / 1024).toFixed(1)} MB`);

const LogsTab = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<LogEvent[]>([]);
  const [filter, setFilter] = useState({ level: "INFO", q: "", trace: "", service: "" });
  const [services, setServices] = useState<string[]>([]);

  const load = useCallback(
    (override?: Partial<typeof filter>) => {
      const f = { ...filter, ...override };
      request<{ obs_logs: { events: LogEvent[]; last_hour: { service: string }[] } }>(
        `query Logs($l: String, $q: String, $t: String, $s: String) {
          obs_logs(level: $l, q: $q, trace_id: $t, service: $s, since_minutes: 1440, limit: 200) { events last_hour } }`,
        { l: f.level || null, q: f.q || null, t: f.trace || null, s: f.service || null },
      )
        .then((r) => {
          setRows(r.obs_logs.events);
          setServices([...new Set(r.obs_logs.last_hour.map((x) => x.service))]);
        })
        .catch((e: Error) => message.error(e.message));
    },
    [filter, message],
  );
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label={tr("Mức log")}
          value={filter.level}
          style={{ width: 130 }}
          onChange={(level) => setFilter({ ...filter, level })}
          options={["DEBUG", "INFO", "WARNING", "ERROR"].map((v) => ({ value: v, label: trf("từ {0}", [v]) }))}
        />
        <Select
          aria-label={tr("Dịch vụ")}
          allowClear
          placeholder={tr("Mọi dịch vụ")}
          style={{ width: 170 }}
          value={filter.service || undefined}
          onChange={(service) => setFilter({ ...filter, service: service ?? "" })}
          options={services.map((v) => ({ value: v, label: v }))}
        />
        <Input
          aria-label={tr("Từ khóa")}
          placeholder={tr("Từ khóa trong nội dung")}
          style={{ width: 240 }}
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          onPressEnter={() => load()}
        />
        <Input
          aria-label={tr("Mã truy vết")}
          placeholder={tr("Mã truy vết (X-Request-Id)")}
          style={{ width: 260 }}
          value={filter.trace}
          onChange={(e) => setFilter({ ...filter, trace: e.target.value })}
          onPressEnter={() => load()}
        />
        <Button type="primary" onClick={() => load()}>
          {tr("Tìm")}
        </Button>
      </div>
      <Table<LogEvent>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: tr("Không có sự kiện nào trong 24 giờ qua.") }}
        columns={[
          { title: tr("Lúc"), dataIndex: "ts", width: 150 },
          { title: tr("Dịch vụ"), dataIndex: "service", width: 110 },
          {
            title: tr("Mức"),
            dataIndex: "level",
            width: 100,
            render: (l: string) => <Tag color={LEVEL_COLOR[l]}>{l}</Tag>,
          },
          { title: tr("Nội dung"), dataIndex: "message" },
          {
            title: tr("Truy vết"),
            dataIndex: "trace_id",
            width: 130,
            render: (t: string | null) =>
              t ? (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setFilter({ ...filter, trace: t, level: "DEBUG" });
                    load({ trace: t, level: "DEBUG" });
                  }}
                >
                  {t.slice(0, 10)}…
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
};

const AnchorsTab = () => {
  const { message, modal } = App.useApp();
  const [data, setData] = useState<{ head_seq: number; anchors: Anchor[] }>();
  const load = useCallback(
    () =>
      request<{ audit_anchors: { head_seq: number; anchors: Anchor[] } }>(
        `query { audit_anchors { head_seq anchors } }`,
      )
        .then((r) => setData(r.audit_anchors))
        .catch((e: Error) => message.error(e.message)),
    [message],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    try {
      const r = (
        await request<{
          audit_anchor_verify: { ok: boolean; checked: number; problems: { seq: number; problem: string }[] };
        }>(`query { audit_anchor_verify { ok checked problems } }`)
      ).audit_anchor_verify;
      modal.info({
        title: r.ok ? tr("Chuỗi kiểm toán nguyên vẹn") : tr("Phát hiện bất thường"),
        content: r.ok
          ? trf("{0} bản neo đều khớp chuỗi hiện tại, chữ ký hợp lệ và bản công bố không bị đổi.", [r.checked])
          : r.problems.map((p) => `Seq ${p.seq}: ${p.problem}`).join("; "),
      });
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const anchorNow = async () => {
    try {
      const r = (
        await request<{ audit_anchor_now: { anchored: boolean } }>(`mutation { audit_anchor_now { anchored seq } }`)
      ).audit_anchor_now;
      message.success(r.anchored ? tr("Đã neo đầu chuỗi hiện tại.") : tr("Chưa có bản ghi mới kể từ lần neo trước."));
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        {tr(
          "Định kỳ hệ thống ký mã băm đầu chuỗi kiểm toán bằng khóa Ed25519 trong két OpenBao và công bố ra kho đối tượng (và điểm ngoài nếu cấu hình). Người sửa trực tiếp CSDL không ký lại được nên không viết lại được lịch sử đã neo.",
        )}
      </Typography.Paragraph>
      <div className="flex gap-2">
        <Button type="primary" onClick={() => void verify()}>
          {tr("Xác minh các bản neo")}
        </Button>
        <Button onClick={() => void anchorNow()}>{tr("Neo ngay")}</Button>
        <span className="self-center text-[12.5px] text-muted">
          {tr("Đầu chuỗi hiện tại: #")}
          {data?.head_seq ?? "—"}
        </span>
      </div>
      <Table<Anchor>
        rowKey="id"
        size="small"
        dataSource={data?.anchors ?? []}
        pagination={false}
        columns={[
          { title: tr("Thứ tự"), dataIndex: "seq", width: 90 },
          {
            title: tr("Mã băm đầu chuỗi"),
            dataIndex: "head_hash",
            render: (h: string) => <code>{h.slice(0, 24)}…</code>,
          },
          { title: tr("Chữ ký"), dataIndex: "alg", width: 130 },
          { title: tr("Neo lúc"), dataIndex: "anchored_at", width: 170 },
          {
            title: tr("Công bố"),
            dataIndex: "published",
            render: (p: Anchor["published"]) =>
              p.map((x) => (
                <Tag key={x.kind} color={x.ok ? "green" : "red"}>
                  {x.kind === "s3" ? tr("Kho đối tượng") : tr("Điểm ngoài")}
                </Tag>
              )),
          },
        ]}
      />
    </div>
  );
};

const BackupsTab = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Backup[]>([]);
  useEffect(() => {
    request<{ backup_runs: Backup[] }>(
      `query { backup_runs { id kind status location size_bytes detail started_at finished_at } }`,
    )
      .then((r) => setRows(r.backup_runs))
      .catch((e: Error) => message.error(e.message));
  }, [message]);
  return (
    <div className="flex flex-col gap-3">
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        {tr(
          "Dịch vụ sao lưu chạy theo lịch, sau mỗi lần sao lưu khôi phục bản vừa tạo vào CSDL tạm và đối chiếu chuỗi băm kiểm toán, bản neo và số dòng. Bản sao lưu chưa qua diễn tập thì chưa nên tin là dùng được.",
        )}
      </Typography.Paragraph>
      <Table<Backup>
        rowKey="id"
        size="small"
        dataSource={rows}
        pagination={{ pageSize: 15, hideOnSinglePage: true }}
        locale={{ emptyText: tr("Chưa có lần sao lưu nào.") }}
        columns={[
          {
            title: tr("Loại"),
            dataIndex: "kind",
            width: 130,
            render: (k: string) => (k === "BACKUP" ? tr("Sao lưu") : tr("Diễn tập khôi phục")),
          },
          {
            title: tr("Kết quả"),
            dataIndex: "status",
            width: 100,
            render: (s: string) => <Tag color={s === "OK" ? "green" : "red"}>{s === "OK" ? tr("Đạt") : tr("Lỗi")}</Tag>,
          },
          { title: tr("Bắt đầu"), dataIndex: "started_at", width: 170 },
          { title: tr("Dung lượng"), dataIndex: "size_bytes", width: 110, render: mb },
          { title: tr("Vị trí"), dataIndex: "location", ellipsis: true },
          {
            title: tr("Chi tiết"),
            dataIndex: "detail",
            render: (d: Backup["detail"]) => d.problems?.join("; ") || d.error || d.databases || "",
          },
        ]}
      />
    </div>
  );
};

export const OpsPage = () => {
  const [tab, setTab] = useState<"logs" | "anchors" | "backups">("logs");
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {tr("Vận hành hệ thống")}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr("Nhật ký tập trung, neo chuỗi kiểm toán và sao lưu khôi phục.")}
        </p>
      </div>
      <Segmented
        className="self-start"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        options={[
          { value: "logs", label: tr("Nhật ký hệ thống") },
          { value: "anchors", label: tr("Neo chuỗi kiểm toán") },
          { value: "backups", label: tr("Sao lưu và khôi phục") },
        ]}
      />
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        {tab === "logs" && <LogsTab />}
        {tab === "anchors" && <AnchorsTab />}
        {tab === "backups" && <BackupsTab />}
      </section>
    </div>
  );
};
