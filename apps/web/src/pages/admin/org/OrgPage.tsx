/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

import { Alert, App, Dropdown, Spin } from "antd";
import { ChevronDown, FileSpreadsheet, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { useSession } from "../../../auth/useSession";
import { primaryButtonClass, secondaryButtonClass } from "../../../components/ui";
import { AdminHeader, NoAccess } from "../shared/AdminHeader";
import { adminClose, type ImportKind } from "../shared/api";
import { EndModal } from "../shared/EndModal";
import { ImportModal } from "../shared/ImportModal";
import { AssignModal, PositionModal, UnitModal } from "../shared/orgModals";
import { useOrgData, type Position } from "../shared/orgData";
import { toDate } from "../shared/period";
import { ORG, usePermissions } from "../shared/usePermissions";
import { UnitDetail, type PositionAction } from "./UnitDetail";
import { UnitTree } from "./UnitTree";
import { tr, trf } from "../../../i18n";

type Dialog =
  | { kind: "unit"; edit: boolean; parentId?: string }
  | { kind: "close-unit" }
  | { kind: "position"; position?: Position }
  | { kind: "assign"; position: Position }
  | { kind: "end-assignment"; position: Position }
  | { kind: "close-position"; position: Position }
  | { kind: "import"; what: ImportKind };

const IMPORT_LABEL: Partial<Record<ImportKind, string>> = { org_unit: tr("đơn vị"), position: tr("vị trí") };

export const OrgPage = () => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const perms = usePermissions();
  const org = useOrgData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>();
  const [showEnded, setShowEnded] = useState(false);

  const root = org.units.find((u) => !u.parent_id && u.period.active);
  const selected = org.unitById.get(params.get("unit") ?? "") ?? root;
  const select = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("unit", id);
        return next;
      },
      { replace: true },
    );

  if (!perms || (org.loading && !org.units.length))
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  if (!perms.has(ORG)) return <NoAccess permission={ORG} />;

  const close = () => setDialog(undefined);
  const done = (text: string) => {
    message.success(text);
    close();
    void org.reload();
  };
  const onPosition = (p: Position, action: PositionAction) =>
    setDialog(
      action === "edit"
        ? { kind: "position", position: p }
        : action === "assign"
          ? { kind: "assign", position: p }
          : action === "end-assignment"
            ? { kind: "end-assignment", position: p }
            : { kind: "close-position", position: p },
    );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title={tr("Cơ cấu tổ chức")}
        subtitle={
          <>
            {tr("Đơn vị, vị trí (ghế) và người giữ ghế của ")} {tenant.tenant_name} {tr(" · quyền gắn với vị trí")}
          </>
        }
        actions={
          <>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "org_unit", label: tr("Nhập đơn vị") },
                  { key: "position", label: tr("Nhập vị trí") },
                ],
                onClick: ({ key }) => setDialog({ kind: "import", what: key as ImportKind }),
              }}
            >
              <button type="button" className={secondaryButtonClass}>
                <FileSpreadsheet className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden /> {tr(" Nhập từ Excel")}
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
              </button>
            </Dropdown>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => setDialog({ kind: "unit", edit: false, parentId: selected?.id })}
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden /> {tr(" Thêm đơn vị")}
            </button>
          </>
        }
      />

      {org.error && (
        <Alert type="error" showIcon message={tr("Không tải được cơ cấu tổ chức")} description={org.error} />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2.2fr)]">
        <UnitTree
          className="max-h-[520px] lg:sticky lg:top-[84px] lg:max-h-[calc(100dvh-108px)]"
          units={org.units}
          selectedId={selected?.id}
          onSelect={select}
          showEnded={showEnded}
          onShowEndedChange={setShowEnded}
        />
        {selected ? (
          <UnitDetail
            unit={selected}
            org={org}
            canManage
            showEnded={showEnded}
            onEditUnit={() => setDialog({ kind: "unit", edit: true })}
            onAddChild={() => setDialog({ kind: "unit", edit: false, parentId: selected.id })}
            onCloseUnit={() => setDialog({ kind: "close-unit" })}
            onAddPosition={() => setDialog({ kind: "position" })}
            onPosition={onPosition}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center text-[13px] text-muted">
            {tr("Tenant chưa có đơn vị gốc.")}
          </div>
        )}
      </div>

      <UnitModal
        open={dialog?.kind === "unit"}
        org={org}
        unit={dialog?.kind === "unit" && dialog.edit ? selected : undefined}
        parentId={dialog?.kind === "unit" ? dialog.parentId : undefined}
        onClose={close}
        onSaved={(id) => {
          done(dialog?.kind === "unit" && dialog.edit ? tr("Đã lưu đơn vị.") : tr("Đã thêm đơn vị."));
          select(id);
        }}
      />
      <PositionModal
        open={dialog?.kind === "position"}
        org={org}
        position={dialog?.kind === "position" ? dialog.position : undefined}
        unitId={selected?.id}
        onClose={close}
        onSaved={() => done(tr("Đã lưu vị trí."))}
      />
      <AssignModal
        open={dialog?.kind === "assign"}
        org={org}
        positionId={dialog?.kind === "assign" ? dialog.position.id : undefined}
        onClose={close}
        onSaved={() => done(tr("Đã bổ nhiệm."))}
      />
      <EndModal
        open={dialog?.kind === "close-unit"}
        title={trf("Ngừng đơn vị {0}?", [selected?.name ?? ""])}
        description={tr(
          "Đơn vị ngừng hoạt động sẽ không nhận vị trí, bổ nhiệm mới. Cần ngừng đơn vị con và vị trí trước.",
        )}
        okText={tr("Ngừng đơn vị")}
        onCancel={close}
        onConfirm={async (d) => {
          try {
            await adminClose("org_unit", selected!.id, toDate(d));
            done(tr("Đã ngừng đơn vị."));
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
      <EndModal
        open={dialog?.kind === "end-assignment"}
        title={
          dialog?.kind === "end-assignment"
            ? trf("Kết thúc bổ nhiệm {0}?", [dialog.position.holder?.person.full_name ?? ""])
            : ""
        }
        description={tr(
          "Việc duyệt đang chờ ở ghế này chuyển cho người giữ ghế kế tiếp (hoặc đẩy lên cấp trên nếu ghế trống); chứng từ người này lập theo hợp đồng chưa duyệt xong sẽ tự hủy (ADR #29).",
        )}
        okText={tr("Kết thúc bổ nhiệm")}
        onCancel={close}
        onConfirm={async (d) => {
          if (dialog?.kind !== "end-assignment" || !dialog.position.holder) return;
          try {
            await adminClose("assignment", dialog.position.holder.id, toDate(d));
            done(tr("Đã kết thúc bổ nhiệm."));
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
      <EndModal
        open={dialog?.kind === "close-position"}
        title={dialog?.kind === "close-position" ? trf("Ngừng vị trí {0}?", [dialog.position.name]) : ""}
        description={tr("Vị trí ngừng dùng không bổ nhiệm được nữa; vai trò gán cho vị trí hết hiệu lực theo.")}
        okText={tr("Ngừng vị trí")}
        onCancel={close}
        onConfirm={async (d) => {
          if (dialog?.kind !== "close-position") return;
          try {
            await adminClose("position", dialog.position.id, toDate(d));
            done(tr("Đã ngừng vị trí."));
          } catch (e) {
            message.error((e as Error).message);
          }
        }}
      />
      {dialog?.kind === "import" && (
        <ImportModal
          open
          kind={dialog.what}
          label={IMPORT_LABEL[dialog.what] ?? ""}
          onClose={close}
          onDone={() => void org.reload()}
        />
      )}
    </div>
  );
};

export default OrgPage;
