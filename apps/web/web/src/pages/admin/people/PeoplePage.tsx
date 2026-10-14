// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, App, ConfigProvider, Form, Input, Segmented, Spin, Table } from "antd";
import { FileSpreadsheet, Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useSession } from "../../../auth/useSession";
import { bambooTableTheme, primaryButtonClass, SearchInput, secondaryButtonClass } from "../../../components/ui";
import { formatDay } from "../../../utils/format";
import { fold } from "../../../utils/text";
import { AccountsResult } from "../shared/AccountsResult";
import { AdminHeader, NoAccess } from "../shared/AdminHeader";
import { adminClose, adminSave, type AccountResult } from "../shared/api";
import { EndModal } from "../shared/EndModal";
import { FormModal } from "../shared/FormModal";
import { ImportModal } from "../shared/ImportModal";
import { AssignModal } from "../shared/orgModals";
import { ASSIGNMENT_LABEL, assignmentsOf, useOrgData, type Assignment, type Position } from "../shared/orgData";
import { toDate } from "../shared/period";
import { ORG, usePermissions } from "../shared/usePermissions";
import { PersonDrawer } from "./PersonDrawer";

type Filter = "all" | "no-account" | "unassigned";
type Dialog =
  | { kind: "new" }
  | { kind: "import" }
  | { kind: "assign"; personId: string }
  | { kind: "end"; a: Assignment; p: Position };

export const PeoplePage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const perms = usePermissions();
  const org = useOrgData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<Dialog>();
  const [accounts, setAccounts] = useState<AccountResult[] | null>(null);

  const rows = useMemo(
    () => org.people.map((p) => ({ person: p, current: assignmentsOf(org, p.id).filter((x) => x.a.period.active) })),
    [org],
  );
  const counts = {
    all: rows.length,
    "no-account": rows.filter((r) => !r.person.idp_subject).length,
    unassigned: rows.filter((r) => r.current.length === 0).length,
  };
  const q = fold(query.trim());
  const shown = rows.filter(
    (r) =>
      (filter === "all" || (filter === "no-account" ? !r.person.idp_subject : r.current.length === 0)) &&
      (!q ||
        fold(
          `${r.person.full_name} ${r.person.employee_code ?? ""} ${r.current.map((c) => c.p.name).join(" ")}`,
        ).includes(q)),
  );

  const selected = org.people.find((p) => p.id === params.get("person"));
  const open = (id?: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set("person", id);
        else next.delete("person");
        return next;
      },
      { replace: true },
    );

  if (!perms || (org.loading && !org.people.length))
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  if (!perms.has(ORG)) return <NoAccess permission={ORG} />;

  const close = () => setDialog(undefined);
  const names = Object.fromEntries(org.people.map((p) => [p.id, p.full_name]));

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title="Người dùng"
        subtitle={<>Nhân sự của {tenant.tenant_name}: vị trí đang giữ và tài khoản đăng nhập</>}
        actions={
          <>
            <button type="button" className={secondaryButtonClass} onClick={() => setDialog({ kind: "import" })}>
              <FileSpreadsheet className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden /> Nhập từ Excel
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => setDialog({ kind: "new" })}>
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Thêm người
            </button>
          </>
        }
      />

      {org.error && <Alert type="error" showIcon message="Không tải được danh sách" description={org.error} />}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          className="w-full sm:w-[320px]"
          value={query}
          onChange={setQuery}
          placeholder="Tên, mã nhân viên, vị trí"
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "all",
              label: (
                <span>
                  Tất cả <span className="tabular-nums text-muted">{counts.all}</span>
                </span>
              ),
            },
            {
              value: "no-account",
              label: (
                <span>
                  Chưa có tài khoản <span className="tabular-nums text-muted">{counts["no-account"]}</span>
                </span>
              ),
            },
            {
              value: "unassigned",
              label: (
                <span>
                  Chưa bổ nhiệm <span className="tabular-nums text-muted">{counts.unassigned}</span>
                </span>
              ),
            },
          ]}
        />
      </div>

      <section
        className="rounded-2xl border border-line bg-white px-3 pb-3 pt-1 shadow-card"
        aria-label="Danh sách người dùng"
      >
        <ConfigProvider theme={bambooTableTheme}>
          <Table
            rowKey={(r) => r.person.id}
            dataSource={shown}
            size="middle"
            scroll={{ x: 760 }}
            pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
            onRow={(r) => ({ onClick: () => open(r.person.id), style: { cursor: "pointer" } })}
            locale={{ emptyText: "Không có người phù hợp." }}
            columns={[
              {
                title: "Họ tên",
                render: (_, r) => (
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">{r.person.full_name}</span>
                    <span className="font-mono text-[11.5px] text-muted">{r.person.employee_code ?? "—"}</span>
                  </span>
                ),
              },
              {
                title: "Vị trí đang giữ",
                render: (_, r) =>
                  r.current.length ? (
                    <span className="flex flex-col gap-0.5">
                      {r.current.map(({ a, p }) => (
                        <span key={a.id} className="text-[12.5px] text-body">
                          {p.name} · <span className="text-muted">{org.unitById.get(p.org_unit_id)?.name}</span>
                          {a.assignment_type !== "PRIMARY" && (
                            <span className="text-muted"> ({ASSIGNMENT_LABEL[a.assignment_type]})</span>
                          )}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-amber-700">Chưa bổ nhiệm</span>
                  ),
              },
              {
                title: "Tài khoản",
                width: 150,
                render: (_, r) =>
                  r.person.idp_subject ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-body">
                      <ShieldCheck className="h-3.5 w-3.5 text-bamboo-600" aria-hidden /> Đã có
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted">Chưa có</span>
                  ),
              },
              {
                title: "Thêm lúc",
                width: 120,
                render: (_, r) => <span className="text-muted">{formatDay(r.person.created_at)}</span>,
              },
            ]}
          />
        </ConfigProvider>
      </section>

      <PersonDrawer
        person={selected}
        org={org}
        onClose={() => open()}
        onChanged={() => void org.reload()}
        onAssign={(personId) => setDialog({ kind: "assign", personId })}
        onEndAssignment={(a, p) => setDialog({ kind: "end", a, p })}
        onAccounts={setAccounts}
        onDeleted={() => {
          open();
          void org.reload();
        }}
      />

      <FormModal<{ full_name: string; employee_code?: string }>
        open={dialog?.kind === "new"}
        title="Thêm người"
        initial={{}}
        onCancel={close}
        onSubmit={async (v) => {
          const id = await adminSave("person", { ...v, employee_code: v.employee_code?.trim() || null });
          message.success("Đã thêm người. Tạo tài khoản và bổ nhiệm ở ngăn bên phải.");
          close();
          await org.reload();
          open(id);
        }}
      >
        {() => (
          <>
            <Form.Item
              name="full_name"
              label="Họ tên"
              rules={[{ required: true, whitespace: true, message: "Nhập họ tên" }]}
            >
              <Input placeholder="Nguyễn Văn An" />
            </Form.Item>
            <Form.Item
              name="employee_code"
              label="Mã nhân viên"
              extra="Nên có để nhập / cập nhật hàng loạt bằng Excel."
            >
              <Input className="font-mono" placeholder="NV0001" />
            </Form.Item>
          </>
        )}
      </FormModal>
      <AssignModal
        open={dialog?.kind === "assign"}
        org={org}
        personId={dialog?.kind === "assign" ? dialog.personId : undefined}
        onClose={close}
        onSaved={() => {
          message.success("Đã bổ nhiệm.");
          close();
          void org.reload();
        }}
      />
      <EndModal
        open={dialog?.kind === "end"}
        title={dialog?.kind === "end" ? `Kết thúc bổ nhiệm ${dialog.p.name}?` : ""}
        description="Việc duyệt đang chờ ở ghế này chuyển cho người giữ ghế kế tiếp (hoặc đẩy lên cấp trên nếu ghế trống)."
        okText="Kết thúc bổ nhiệm"
        onCancel={close}
        onConfirm={async (d) => {
          if (dialog?.kind !== "end") return;
          try {
            await adminClose("assignment", dialog.a.id, toDate(d));
            message.success("Đã kết thúc bổ nhiệm.");
            close();
            void org.reload();
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
      {dialog?.kind === "import" && (
        <ImportModal open kind="person" label="nhân sự" onClose={close} onDone={() => void org.reload()} />
      )}
      <AccountsResult results={accounts} names={names} onClose={() => setAccounts(null)} />
    </div>
  );
};

export default PeoplePage;
