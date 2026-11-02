// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { ConfigProvider, Dropdown, Table, Tag, Tooltip } from "antd";
import { Building2, Crown, MoreHorizontal, Pencil, Plus, Power, UserPlus } from "lucide-react";

import {
  bambooTableTheme,
  Dot,
  Panel,
  smallPrimaryButtonClass,
  smallSecondaryButtonClass,
} from "../../../components/ui";
import { ASSIGNMENT_LABEL, type OrgData, type Position, type Unit } from "../shared/orgData";
import { periodLabel } from "../shared/period";

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-ui text-body hover:bg-canvas focus-visible:outline-2 focus-visible:outline-bamboo-500";

export type PositionAction = "edit" | "assign" | "end-assignment" | "close";

export const UnitDetail = ({
  unit,
  org,
  canManage,
  showEnded,
  onEditUnit,
  onAddChild,
  onCloseUnit,
  onAddPosition,
  onPosition,
}: {
  unit: Unit;
  org: OrgData;
  canManage: boolean;
  showEnded: boolean;
  onEditUnit: () => void;
  onAddChild: () => void;
  onCloseUnit: () => void;
  onAddPosition: () => void;
  onPosition: (p: Position, action: PositionAction) => void;
}) => {
  const parent = unit.parent_id ? org.unitById.get(unit.parent_id) : undefined;
  const children = org.units.filter((u) => u.parent_id === unit.id && !u.period.ended);
  const positions = org.positions
    .filter((p) => p.org_unit_id === unit.id && (showEnded || !p.period.ended))
    .sort((a, b) => Number(b.is_head) - Number(a.is_head) || a.name.localeCompare(b.name, "vi"));
  const filled = positions.filter((p) => p.holder).length;
  const positionName = (id: string | null) => {
    const p = id ? org.positions.find((x) => x.id === id) : undefined;
    return p ? `${p.name} · ${org.unitById.get(p.org_unit_id)?.name ?? ""}` : undefined;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section
        className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-card"
        aria-label={`Đơn vị ${unit.name}`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11.5px] tracking-tight text-muted">{unit.code}</div>
            <h2 className="mt-1 flex items-center gap-2 text-[18px] font-semibold leading-snug text-ink">
              {unit.is_legal_entity && (
                <Building2 className="h-4.5 w-4.5 text-bamboo-700" strokeWidth={1.75} aria-label="Công ty" />
              )}
              {unit.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <span>
                Loại: <span className="text-ink">{unit.unit_type.name}</span>
              </span>
              <span>
                Thuộc: <span className="text-ink">{parent?.name ?? "— (gốc của tenant)"}</span>
              </span>
              <span>
                {children.length} đơn vị con · {filled}/{positions.filter((p) => p.period.active).length} ghế có người
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Dot tone={unit.period.ended ? "neutral" : "success"} />{" "}
                {unit.period.ended
                  ? `Đã ngừng · ${periodLabel(unit.period)}`
                  : `Hoạt động từ ${periodLabel(unit.period).split(" – ")[0]}`}
              </span>
            </div>
          </div>
          {canManage && !unit.period.ended && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className={smallSecondaryButtonClass} onClick={onEditUnit}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Sửa
              </button>
              <button type="button" className={smallSecondaryButtonClass} onClick={onAddChild}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Đơn vị con
              </button>
              {unit.parent_id && (
                <Tooltip title="Ngừng hoạt động (cần ngừng đơn vị con và vị trí trước)">
                  <button
                    type="button"
                    className={smallSecondaryButtonClass}
                    onClick={onCloseUnit}
                    aria-label="Ngừng đơn vị"
                  >
                    <Power className="h-3.5 w-3.5 text-red-600" aria-hidden />
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </section>

      <Panel
        title={
          <>
            Vị trí trong đơn vị{" "}
            <span className="ml-1 text-[12.5px] font-normal tabular-nums text-muted">{positions.length}</span>
          </>
        }
        extra={
          canManage &&
          !unit.period.ended && (
            <button type="button" className={smallPrimaryButtonClass} onClick={onAddPosition}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Thêm vị trí
            </button>
          )
        }
        bodyClassName="px-3 pb-3"
      >
        <ConfigProvider theme={bambooTableTheme}>
          <Table<Position>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={positions}
            scroll={{ x: 720 }}
            locale={{ emptyText: "Chưa có vị trí. Thêm vị trí (ghế) rồi bổ nhiệm người vào." }}
            columns={[
              {
                title: "Vị trí",
                render: (_, p) => (
                  <span className="flex min-w-0 flex-col">
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      {p.is_head && (
                        <Crown className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} aria-label="Trưởng đơn vị" />
                      )}
                      <span className={p.period.ended ? "text-muted line-through" : undefined}>{p.name}</span>
                    </span>
                    <span className="text-[11.5px] text-muted">{p.job_title?.name ?? "Chưa gắn chức danh"}</span>
                  </span>
                ),
              },
              {
                title: "Người giữ",
                width: 240,
                render: (_, p) =>
                  p.holder ? (
                    <span className="flex flex-col">
                      <span className="text-ink">{p.holder.person.full_name}</span>
                      <span className="text-[11.5px] text-muted">
                        {ASSIGNMENT_LABEL[p.holder.assignment_type]} · {periodLabel(p.holder.period)}
                      </span>
                    </span>
                  ) : p.period.ended ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <Tag color="warning" bordered={false}>
                      Ghế trống
                    </Tag>
                  ),
              },
              {
                title: "Báo cáo cho",
                width: 200,
                render: (_, p) => (
                  <span className="text-body">
                    {positionName(p.reports_to_id) ?? (p.is_head ? "Trưởng đơn vị cha" : "Trưởng đơn vị")}
                  </span>
                ),
              },
              {
                title: "",
                width: 140,
                align: "right",
                render: (_, p) =>
                  canManage &&
                  !p.period.ended && (
                    <span className="inline-flex items-center gap-1">
                      {p.holder ? (
                        <button
                          type="button"
                          className={smallSecondaryButtonClass}
                          onClick={() => onPosition(p, "end-assignment")}
                        >
                          Kết thúc
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={smallSecondaryButtonClass}
                          onClick={() => onPosition(p, "assign")}
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden /> Bổ nhiệm
                        </button>
                      )}
                      <Dropdown
                        trigger={["click"]}
                        menu={{
                          items: [
                            { key: "edit", label: "Sửa vị trí" },
                            { key: "close", label: "Ngừng vị trí", danger: true, disabled: Boolean(p.holder) },
                          ],
                          onClick: ({ key }) => onPosition(p, key as PositionAction),
                        }}
                      >
                        <button type="button" className={iconBtn} aria-label={`Thao tác với ${p.name}`}>
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                      </Dropdown>
                    </span>
                  ),
              },
            ]}
          />
        </ConfigProvider>
      </Panel>
    </div>
  );
};
