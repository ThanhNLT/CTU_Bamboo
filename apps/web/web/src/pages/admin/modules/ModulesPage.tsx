// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { App, Spin, Tag } from "antd";
import { useState } from "react";

import { useSession } from "../../../auth/useSession";
import { Panel } from "../../../components/ui/Panel";
import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../../components/ui/buttons";
import { changeModule, type ModuleChange, type ModuleInfo } from "../../../modules/api";
import { useModules } from "../../../modules/useModules";
import { AdminHeader, NoAccess } from "../shared/AdminHeader";

const CORE = [
  "Cơ cấu tổ chức: đơn vị, vị trí, bổ nhiệm",
  "Người dùng và tài khoản đăng nhập",
  "Vai trò & phân quyền",
  "Danh mục & dữ liệu chủ",
  "Nhật ký kiểm toán, thông báo, vận hành hệ thống",
];

const status = (m: ModuleInfo) =>
  m.enabled ? (
    <Tag color="green">Đang bật</Tag>
  ) : m.installed ? (
    <Tag>Chưa bật</Tag>
  ) : (
    <Tag color="default" className="border-dashed">
      Chưa cài trên máy
    </Tag>
  );

const ServiceDot = ({ running }: { running: boolean | null }) => (
  <span
    className={`inline-block h-2 w-2 rounded-full ${running ? "bg-bamboo-500" : running === false ? "bg-line" : "bg-red-400"}`}
    aria-hidden
  />
);

export const ModulesPage = () => {
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const { overview, update } = useModules();
  const [busy, setBusy] = useState<string>();

  if (!overview)
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  if (!overview.can_manage && !overview.can_install) return <NoAccess permission="core.module.manage" />;

  const byCode = new Map(overview.modules.map((m) => [m.code, m]));
  const names = (codes: string[]) => codes.map((c) => byCode.get(c)?.name ?? c).join(", ");

  const run = async (action: ModuleChange, m: ModuleInfo) => {
    setBusy(m.code);
    try {
      const next = await changeModule(action, m.code);
      update(next);
      const changed = names(next.changed);
      message.success(
        {
          module_enable: `Đã bật ${changed || m.name}.`,
          module_disable: `Đã tắt ${m.name}. Dữ liệu vẫn được giữ, bật lại là dùng tiếp.`,
          module_install: `Đã cài ${changed || m.name}; container sẽ khởi động trong ít phút.`,
          module_uninstall: `Đã gỡ ${m.name}; container sẽ dừng trong ít phút.`,
        }[action],
      );
    } catch (e) {
      modal.error({ title: "Không thực hiện được", content: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  };

  const enable = (m: ModuleInfo) => {
    const extra = m.depends.filter((c) => !byCode.get(c)?.enabled);
    const needInstall = [m.code, ...m.depends].filter((c) => !byCode.get(c)?.installed);
    modal.confirm({
      title: `Bật ${m.name} cho ${tenant.tenant_name}?`,
      content: (
        <div className="space-y-2 text-[13px]">
          <p>{m.description}.</p>
          {extra.length > 0 && <p>Hệ thống bật kèm các chức năng cần thiết: {names(extra)}.</p>}
          {needInstall.length > 0 && (
            <p>
              Chưa cài trên máy: {names(needInstall)}. Hệ thống sẽ cài và khởi động các dịch vụ đi kèm; lần đầu có thể
              mất vài phút.
            </p>
          )}
        </div>
      ),
      okText: "Bật",
      cancelText: "Hủy",
      onOk: () => run("module_enable", m),
    });
  };

  const disable = (m: ModuleInfo) =>
    modal.confirm({
      title: `Tắt ${m.name}?`,
      content: (
        <p className="text-[13px]">
          Menu và thao tác của chức năng này bị ẩn với mọi người trong {tenant.tenant_name}. Dữ liệu đã có được giữ
          nguyên. Hệ thống không cho tắt khi còn chứng từ đang chờ duyệt hoặc chức năng khác đang dựa vào nó.
        </p>
      ),
      okText: "Tắt",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: () => run("module_disable", m),
    });

  const uninstall = (m: ModuleInfo) =>
    modal.confirm({
      title: `Gỡ ${m.name} khỏi máy chủ?`,
      content: (
        <p className="text-[13px]">
          Các dịch vụ đi kèm ({m.services.map((s) => s.name).join(", ") || "không có"}) sẽ dừng để trả RAM. Dữ liệu được
          giữ; cài lại là dùng tiếp. Chỉ gỡ được khi không công ty nào trên máy còn bật chức năng này.
        </p>
      ),
      okText: "Gỡ khỏi máy",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: () => run("module_uninstall", m),
    });

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title="Quản lý chức năng"
        subtitle={
          <>
            Bật những chức năng {tenant.tenant_name} cần dùng; chức năng chưa bật không hiện trên menu
            {overview.can_install ? ", chưa cài thì dịch vụ của nó không chạy, không tốn tài nguyên máy chủ" : ""}
          </>
        }
      />

      <Panel title="Phần lõi — luôn bật">
        <ul className="m-0 grid list-none gap-x-6 gap-y-1.5 p-0 text-[13px] text-body sm:grid-cols-2 lg:grid-cols-3">
          {CORE.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bamboo-500" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {overview.modules.map((m) => (
          <section
            key={m.code}
            aria-label={m.name}
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-5 shadow-card"
          >
            <header className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">{m.name}</h2>
              {status(m)}
            </header>
            <p className="m-0 flex-1 text-[13px] text-body">{m.description}</p>
            {(m.depends.length > 0 || m.dependents.length > 0) && (
              <dl className="m-0 space-y-1 text-[12.5px] text-muted">
                {m.depends.length > 0 && (
                  <div>
                    <dt className="inline">Cần: </dt>
                    <dd className="inline">{names(m.depends)}</dd>
                  </div>
                )}
                {m.dependents.length > 0 && (
                  <div>
                    <dt className="inline">Được dùng bởi: </dt>
                    <dd className="inline">{names(m.dependents)}</dd>
                  </div>
                )}
              </dl>
            )}
            {overview.can_install && m.services.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[12px] text-muted">
                {m.services.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center gap-1.5"
                    title={s.running ? "Đang chạy" : s.running === false ? "Đang dừng" : "Chưa có container"}
                  >
                    <ServiceDot running={s.running} /> {s.name}
                  </li>
                ))}
              </ul>
            )}
            <footer className="flex flex-wrap gap-2">
              {m.enabled
                ? overview.can_manage && (
                    <button
                      type="button"
                      className={smallSecondaryButtonClass}
                      disabled={!!busy}
                      onClick={() => disable(m)}
                    >
                      {busy === m.code ? "Đang tắt..." : "Tắt"}
                    </button>
                  )
                : overview.can_manage &&
                  (m.installed || overview.can_install) && (
                    <button
                      type="button"
                      className={smallPrimaryButtonClass}
                      disabled={!!busy}
                      onClick={() => enable(m)}
                    >
                      {busy === m.code ? "Đang bật..." : "Bật"}
                    </button>
                  )}
              {overview.can_install && m.installed && !m.enabled && (
                <button
                  type="button"
                  className={smallSecondaryButtonClass}
                  disabled={!!busy}
                  onClick={() => uninstall(m)}
                >
                  Gỡ khỏi máy
                </button>
              )}
              {overview.can_install && !m.installed && !overview.can_manage && (
                <button
                  type="button"
                  className={smallPrimaryButtonClass}
                  disabled={!!busy}
                  onClick={() => void run("module_install", m)}
                >
                  Cài trên máy
                </button>
              )}
              {!m.installed && !overview.can_install && (
                <span className="text-[12px] text-muted">Nhờ quản trị nền tảng cài trên máy chủ trước</span>
              )}
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
};
