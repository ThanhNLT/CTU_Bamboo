import { Alert, App, Button, Input, Select, Spin, Switch, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  deletePref,
  loadPrefs,
  myDeliveries,
  savePref,
  sendTest,
  type ChannelPref,
  type Delivery,
  type Kind,
} from "./api";
import { tr, trf } from "../../i18n";

const LABEL = {
  EMAIL: { title: "Email", hint: tr("Địa chỉ email nhận thông báo"), placeholder: "ten@congty.vn" },
  SMS: { title: "SMS", hint: tr("Số điện thoại, có thể bắt đầu bằng +84"), placeholder: "+84901234567" },
  WEBHOOK: {
    title: "Webhook",
    hint: tr("Địa chỉ https nhận thông báo (Slack, Teams, Zalo OA...)"),
    placeholder: "https://...",
  },
} as const;
const STATUS = {
  PENDING: { color: "processing", label: tr("Chờ gửi") },
  LEASED: { color: "processing", label: tr("Đang gửi") },
  DELIVERED: { color: "green", label: tr("Đã gửi") },
  DEAD: { color: "red", label: tr("Không gửi được") },
} as const;

const ChannelCard = ({ pref, kinds, onChanged }: { pref: ChannelPref; kinds: Kind[]; onChanged: () => void }) => {
  const { message } = App.useApp();
  const [address, setAddress] = useState(pref.address);
  const [enabled, setEnabled] = useState(pref.enabled);
  const [picked, setPicked] = useState<string[]>(pref.kinds ?? []);
  const [busy, setBusy] = useState(false);
  const info = LABEL[pref.channel];

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(ok);
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card" aria-label={info.title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold text-ink">{info.title}</h2>
        {!pref.configured && <Tag color="orange">{tr("Máy chủ chưa cấu hình kênh này")}</Tag>}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <label className="block text-[12px] font-medium text-body">
          {info.hint}
          <Input
            aria-label={trf("Địa chỉ {0}", [info.title])}
            className="mt-1"
            placeholder={info.placeholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-[12px] font-medium text-body">
          {tr("Loại thông báo (để trống là nhận tất cả)")}
          <Select
            aria-label={trf("Loại thông báo {0}", [info.title])}
            className="mt-1 w-full"
            mode="multiple"
            allowClear
            value={picked}
            onChange={setPicked}
            options={kinds.map((k) => ({ value: k.code, label: k.label }))}
            placeholder={tr("Tất cả")}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={enabled} onChange={setEnabled} aria-label={trf("Bật {0}", [info.title])} /> {tr(" Bật")}
          </label>
          <Button
            type="primary"
            loading={busy}
            disabled={!address.trim()}
            onClick={() =>
              void run(
                () =>
                  savePref({
                    channel: pref.channel,
                    address: address.trim(),
                    enabled,
                    kinds: picked.length ? picked : null,
                  }),
                trf("Đã lưu kênh {0}.", [info.title]),
              )
            }
          >
            {tr("Lưu")}
          </Button>
          <Button
            disabled={busy || !pref.address || !pref.configured}
            onClick={() => void run(() => sendTest(pref.channel), trf("Đã xếp hàng tin thử qua {0}.", [info.title]))}
          >
            {tr("Gửi thử")}
          </Button>
          {pref.address && (
            <Button
              danger
              type="text"
              disabled={busy}
              onClick={() => void run(() => deletePref(pref.channel), tr("Đã xóa kênh."))}
            >
              {tr("Xóa")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};

export const NotificationSettingsPage = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<{ channels: ChannelPref[]; kinds: Kind[] }>();
  const [rows, setRows] = useState<Delivery[]>([]);

  const load = useCallback(() => {
    loadPrefs()
      .then(setData)
      .catch((e: Error) => message.error(e.message));
    myDeliveries()
      .then(setRows)
      .catch(() => setRows([]));
  }, [message]);

  useEffect(() => {
    load();
    const timer = window.setInterval(
      () =>
        void myDeliveries()
          .then(setRows)
          .catch(() => undefined),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data) return <Spin className="mt-24 block" />;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {tr("Thông báo ngoài ứng dụng")}
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr(
            "Thông báo luôn hiện trong ứng dụng; bật thêm email, SMS hoặc webhook để nhận cả khi không mở ứng dụng. Mỗi tin được giao có biên nhận ký số để đối soát.",
          )}
        </p>
      </div>
      <Alert
        type="info"
        showIcon
        message={tr(
          "Địa chỉ nhận chỉ dùng để gửi thông báo của bạn, không hiện cho người khác và không đưa vào kho dữ liệu phân tích.",
        )}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data.channels.map((c) => (
          <ChannelCard key={`${c.channel}-${c.address}-${c.enabled}`} pref={c} kinds={data.kinds} onChanged={load} />
        ))}
      </div>
      <section
        className="rounded-2xl border border-line bg-surface p-4 shadow-card"
        aria-label={tr("Tin đã gửi gần đây")}
      >
        <h2 className="m-0 mb-3 text-[15px] font-semibold text-ink">{tr("Tin đã gửi gần đây")}</h2>
        <Table<Delivery>
          rowKey="id"
          size="small"
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: tr("Chưa có tin nào gửi ra ngoài.") }}
          columns={[
            { title: tr("Kênh"), dataIndex: "channel", width: 100 },
            { title: tr("Nội dung"), dataIndex: "title" },
            { title: tr("Đến"), dataIndex: "address", width: 170 },
            {
              title: tr("Trạng thái"),
              dataIndex: "status",
              width: 150,
              render: (s: keyof typeof STATUS, r) => (
                <span title={r.last_error ?? undefined}>
                  <Tag color={STATUS[s]?.color}>{STATUS[s]?.label ?? s}</Tag>
                </span>
              ),
            },
            { title: tr("Thời điểm"), dataIndex: "created_at", width: 170 },
          ]}
        />
      </section>
    </div>
  );
};
