// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App, Checkbox, ConfigProvider, Form, Input, Spin, Table } from "antd";
import { FileSpreadsheet, KeyRound, Plus, Save, ShieldPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useSession } from "../../../auth/useSession";
import {
  bambooTableTheme,
  Dot,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  smallPrimaryButtonClass,
  smallSecondaryButtonClass,
} from "../../../components/ui";
import { cn } from "../../../utils/cn";
import { AdminHeader, NoAccess } from "../shared/AdminHeader";
import { adminClose, adminSave } from "../shared/api";
import { EndModal } from "../shared/EndModal";
import { FormModal } from "../shared/FormModal";
import { ImportModal } from "../shared/ImportModal";
import { SCOPE_LABEL, useOrgData } from "../shared/orgData";
import { parsePeriod, periodLabel, toDate, type Period } from "../shared/period";
import { useGql } from "../shared/useGql";
import { PERM, usePermissions } from "../shared/usePermissions";
import { GrantModal } from "./GrantModal";

const ROLES = `
  query AdminRoles {
    core_role(order_by: { name: asc }) {
      id code name
      role_permissions { permission_code }
      role_grants { id scope scope_unit_id position_id org_unit_id person_id valid_period }
    }
    core_permission(order_by: { code: asc }) { code description }
  }
`;

type Grant = {
  id: string;
  scope: string;
  scope_unit_id: string | null;
  position_id: string | null;
  org_unit_id: string | null;
  person_id: string | null;
  valid_period: string;
};
type Role = {
  id: string;
  code: string;
  name: string;
  role_permissions: { permission_code: string }[];
  role_grants: Grant[];
};
type Data = { core_role: Role[]; core_permission: { code: string; description: string }[] };

const MODULE: Record<string, string> = {
  core: "Tổ chức & phân quyền",
  proc: "Mua sắm",
  hr: "Nhân sự",
  wf: "Phê duyệt",
  ic: "Đơn hàng nội bộ",
  mdm: "Dữ liệu chủ",
  audit: "Kiểm toán",
};

type Dialog =
  { kind: "role"; edit: boolean } | { kind: "grant" } | { kind: "revoke"; grant: Grant } | { kind: "import" };

export const RolesPage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const perms = usePermissions();
  const org = useOrgData();
  const q = useGql<Data>(ROLES);
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>();
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  const roles = q.data?.core_role ?? [];
  const role = roles.find((r) => r.id === params.get("role")) ?? roles[0];
  const current = useMemo(() => new Set(role?.role_permissions.map((p) => p.permission_code)), [role]);
  useEffect(() => setDraft(new Set(current)), [current]);

  const groups = useMemo(() => {
    const map = new Map<string, { code: string; description: string }[]>();
    for (const p of q.data?.core_permission ?? []) {
      const m = p.code.split(".")[0];
      map.set(m, [...(map.get(m) ?? []), p]);
    }
    return [...map.entries()];
  }, [q.data]);

  if (!perms || (q.loading && !q.data))
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  if (!perms.has(PERM)) return <NoAccess permission={PERM} />;

  const select = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("role", id);
        return next;
      },
      { replace: true },
    );
  const close = () => setDialog(undefined);
  const reload = () => void q.reload();
  const dirty = role && (draft.size !== current.size || [...draft].some((c) => !current.has(c)));

  const savePermissions = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await adminSave("role", { id: role.id, code: role.code, name: role.name, permission_codes: [...draft] });
      message.success("Đã lưu bộ quyền. Áp dụng ngay cho mọi vị trí được cấp vai trò này.");
      reload();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const target = (g: Grant) => {
    if (g.position_id) {
      const p = org.positions.find((x) => x.id === g.position_id);
      return {
        kind: "Vị trí",
        name: p?.name ?? "—",
        sub: `${org.unitPath(p?.org_unit_id)}${p?.holder ? ` · ${p.holder.person.full_name}` : " · ghế trống"}`,
      };
    }
    if (g.org_unit_id)
      return { kind: "Đơn vị", name: org.unitById.get(g.org_unit_id)?.name ?? "—", sub: "Mọi vị trí trong đơn vị" };
    const person = org.people.find((x) => x.id === g.person_id);
    return { kind: "Người", name: person?.full_name ?? "—", sub: "Ngoại lệ ngoài cây tổ chức" };
  };
  const grants = (role?.role_grants ?? [])
    .map((g) => ({ ...g, period: parsePeriod(g.valid_period) }))
    .filter((g) => showEnded || !g.period.ended);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title="Vai trò & phân quyền"
        subtitle={<>Vai trò là gói quyền; cấp vai trò cho vị trí trong {tenant.tenant_name}, phạm vi theo cây đơn vị</>}
        actions={
          <>
            <button type="button" className={secondaryButtonClass} onClick={() => setDialog({ kind: "import" })}>
              <FileSpreadsheet className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden /> Nhập cấp quyền
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => setDialog({ kind: "role", edit: false })}
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Thêm vai trò
            </button>
          </>
        }
      />
      {q.error && <Alert type="error" showIcon message="Không tải được vai trò" description={q.error} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2.4fr)]">
        <nav
          aria-label="Vai trò"
          className="rounded-2xl border border-line bg-surface p-2 shadow-card lg:sticky lg:top-[84px] lg:self-start"
        >
          <ul className="m-0 list-none space-y-0.5 p-0">
            {roles.map((r) => {
              const on = r.id === role?.id;
              const active = r.role_grants.filter((g) => parsePeriod(g.valid_period).active).length;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => select(r.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "block w-full rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-bamboo-500",
                      on ? "bg-bamboo-50" : "hover:bg-canvas",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                      <KeyRound className={cn("h-3.5 w-3.5", on ? "text-bamboo-700" : "text-muted")} aria-hidden />{" "}
                      {r.name}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-muted">
                      <span className="font-mono">{r.code}</span> · {r.role_permissions.length} quyền · {active} nơi
                      được cấp
                    </span>
                  </button>
                </li>
              );
            })}
            {roles.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-muted">Chưa có vai trò.</li>}
          </ul>
        </nav>

        {role && (
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title={
                <span className="flex flex-col">
                  <span>{role.name}</span>
                  <span className="font-mono text-[11.5px] font-normal text-muted">{role.code}</span>
                </span>
              }
              extra={
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={smallSecondaryButtonClass}
                    onClick={() => setDialog({ kind: "role", edit: true })}
                  >
                    Đổi tên
                  </button>
                  <button
                    type="button"
                    className={smallPrimaryButtonClass}
                    disabled={!dirty || saving}
                    onClick={() => void savePermissions()}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden /> {saving ? "Đang lưu…" : "Lưu bộ quyền"}
                  </button>
                </span>
              }
            >
              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line pt-4 md:grid-cols-2">
                {groups.map(([m, list]) => (
                  <fieldset key={m} className="min-w-0">
                    <legend className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {MODULE[m] ?? m}
                    </legend>
                    <ul className="m-0 list-none space-y-1.5 p-0">
                      {list.map((p) => (
                        <li key={p.code}>
                          <Checkbox
                            checked={draft.has(p.code)}
                            onChange={(e) =>
                              setDraft((d) => {
                                const next = new Set(d);
                                if (e.target.checked) next.add(p.code);
                                else next.delete(p.code);
                                return next;
                              })
                            }
                          >
                            <span className="text-[13px] text-ink">{p.description}</span>
                            <span className="ml-1.5 font-mono text-[11px] text-muted">{p.code}</span>
                          </Checkbox>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ))}
              </div>
              {dirty && <p className="mb-0 mt-3 text-[12px] text-amber-700">Có thay đổi chưa lưu.</p>}
            </Panel>

            <Panel
              title={
                <>
                  Được cấp cho{" "}
                  <span className="ml-1 text-[12.5px] font-normal tabular-nums text-muted">{grants.length}</span>
                </>
              }
              extra={
                <span className="flex items-center gap-3">
                  <Checkbox checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)}>
                    <span className="text-[12px] text-muted">Hiện đã thu hồi</span>
                  </Checkbox>
                  <button
                    type="button"
                    className={smallPrimaryButtonClass}
                    onClick={() => setDialog({ kind: "grant" })}
                  >
                    <ShieldPlus className="h-3.5 w-3.5" aria-hidden /> Cấp vai trò
                  </button>
                </span>
              }
              bodyClassName="px-3 pb-3"
            >
              <ConfigProvider theme={bambooTableTheme}>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={grants}
                  scroll={{ x: 680 }}
                  locale={{ emptyText: "Chưa cấp cho vị trí nào." }}
                  columns={[
                    {
                      title: "Đối tượng",
                      render: (_, g) => {
                        const t = target(g);
                        return (
                          <span className="flex flex-col">
                            <span className="text-ink">
                              <span className="text-muted">{t.kind}:</span> {t.name}
                            </span>
                            <span className="text-[11.5px] text-muted">{t.sub}</span>
                          </span>
                        );
                      },
                    },
                    {
                      title: "Phạm vi",
                      width: 220,
                      render: (_, g) => (
                        <span className="text-body">
                          {SCOPE_LABEL[g.scope]}
                          {g.scope_unit_id && (
                            <span className="block text-[11.5px] text-muted">
                              tại {org.unitById.get(g.scope_unit_id)?.name}
                            </span>
                          )}
                        </span>
                      ),
                    },
                    {
                      title: "Hiệu lực",
                      width: 200,
                      render: (_, g: Grant & { period: Period }) => (
                        <span className="inline-flex items-center gap-1.5 text-body">
                          <Dot tone={g.period.active ? "success" : "neutral"} /> {periodLabel(g.period)}
                        </span>
                      ),
                    },
                    {
                      title: "",
                      width: 100,
                      align: "right",
                      render: (_, g: Grant & { period: Period }) =>
                        !g.period.ended && (
                          <button
                            type="button"
                            className={smallSecondaryButtonClass}
                            onClick={() => setDialog({ kind: "revoke", grant: g })}
                          >
                            Thu hồi
                          </button>
                        ),
                    },
                  ]}
                />
              </ConfigProvider>
            </Panel>
          </div>
        )}
      </div>

      <FormModal<{ code: string; name: string }>
        open={dialog?.kind === "role"}
        title={dialog?.kind === "role" && dialog.edit ? "Đổi tên vai trò" : "Thêm vai trò"}
        initial={dialog?.kind === "role" && dialog.edit && role ? { code: role.code, name: role.name } : {}}
        onCancel={close}
        onSubmit={async (v) => {
          const edit = dialog?.kind === "role" && dialog.edit && role;
          const id = await adminSave("role", edit ? { id: role.id, ...v } : { ...v, permission_codes: [] });
          message.success(edit ? "Đã đổi tên vai trò." : "Đã thêm vai trò. Chọn quyền rồi bấm Lưu bộ quyền.");
          close();
          await q.reload();
          select(id);
        }}
      >
        {() => (
          <>
            <Form.Item
              name="code"
              label="Mã vai trò"
              rules={[{ required: true, pattern: /^[A-Z0-9_]+$/, message: "Chữ IN HOA không dấu, số, gạch dưới" }]}
            >
              <Input className="font-mono" placeholder="KE_TOAN_TRUONG" />
            </Form.Item>
            <Form.Item
              name="name"
              label="Tên vai trò"
              rules={[{ required: true, whitespace: true, message: "Nhập tên" }]}
            >
              <Input placeholder="Kế toán trưởng" />
            </Form.Item>
          </>
        )}
      </FormModal>
      {role && (
        <GrantModal
          open={dialog?.kind === "grant"}
          org={org}
          roleId={role.id}
          roleName={role.name}
          onClose={close}
          onSaved={() => {
            message.success("Đã cấp vai trò.");
            close();
            reload();
          }}
        />
      )}
      <EndModal
        open={dialog?.kind === "revoke"}
        title="Thu hồi vai trò?"
        description="Vị trí / người không còn các quyền của vai trò này từ thời điểm thu hồi."
        okText="Thu hồi"
        onCancel={close}
        onConfirm={async (d) => {
          if (dialog?.kind !== "revoke") return;
          try {
            await adminClose("role_grant", dialog.grant.id, toDate(d));
            message.success("Đã thu hồi.");
            close();
            reload();
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
      {dialog?.kind === "import" && (
        <ImportModal open kind="role_grant" label="cấp quyền" onClose={close} onDone={reload} />
      )}
    </div>
  );
};

export default RolesPage;
