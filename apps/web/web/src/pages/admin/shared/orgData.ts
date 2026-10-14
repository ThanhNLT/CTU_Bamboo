// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Cơ cấu tổ chức của tenant (đơn vị, vị trí, người giữ ghế, danh mục) — dùng chung cho trang Cơ cấu, Người dùng
// và Vai trò. Hasura lọc theo tenant đang chọn.

// ===== Thư viện =====
import { useMemo } from "react"; // React

// ===== Module nội bộ =====
import { parsePeriod, type Period } from "./period";
import { useGql } from "./useGql";

// ===== Truy vấn GraphQL =====
const ORG = `
  query AdminOrg {
    core_org_unit(order_by: { name: asc }) {
      id code name parent_id is_legal_entity province lat lng valid_period unit_type_id unit_type { code name }
    }
    core_catalog_item(order_by: [{ catalog: asc }, { name: asc }]) { id catalog code name }
    core_position(order_by: { name: asc }) {
      id name is_head org_unit_id job_title_id reports_to_id valid_period job_title { name }
      assignments(order_by: { created_at: desc }) {
        id assignment_type valid_period contract_no contract_partner person { id full_name employee_code }
      }
    }
    core_person(order_by: { full_name: asc }) { id full_name employee_code idp_subject created_at }
  }
`;

// ===== Kiểu dữ liệu =====
type Row<T> = T & { valid_period: string };
export type Unit = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_legal_entity: boolean;
  province: string | null;
  lat: number | null;
  lng: number | null;
  unit_type_id: string;
  unit_type: { code: string; name: string };
  period: Period;
};
export type CatalogItem = { id: string; catalog: string; code: string; name: string };
export type Assignment = {
  id: string;
  assignment_type: string;
  contract_no: string | null;
  contract_partner: string | null;
  person: { id: string; full_name: string; employee_code: string | null };
  period: Period;
};
export type Position = {
  id: string;
  name: string;
  is_head: boolean;
  org_unit_id: string;
  job_title_id: string | null;
  reports_to_id: string | null;
  job_title: { name: string } | null;
  period: Period;
  assignments: Assignment[];
  /** Bổ nhiệm đang hiệu lực (mỗi ghế tối đa một người). */
  holder?: Assignment;
};
export type Person = {
  id: string;
  full_name: string;
  employee_code: string | null;
  idp_subject: string | null;
  created_at: string;
};

type Raw = {
  core_org_unit: Row<Omit<Unit, "period">>[];
  core_catalog_item: CatalogItem[];
  core_position: Row<
    Omit<Position, "period" | "assignments" | "holder"> & { assignments: Row<Omit<Assignment, "period">>[] }
  >[];
  core_person: Person[];
};

// ===== Hằng số =====
export const ASSIGNMENT_LABEL: Record<string, string> = {
  PRIMARY: "Giữ chính",
  CONCURRENT: "Kiêm nhiệm",
  ACTING: "Quyền",
  CONTRACT: "Hợp đồng",
};

// ===== Hook =====
export const useOrgData = () => {
  const q = useGql<Raw>(ORG);
  const data = useMemo(() => {
    const raw = q.data;
    const units: Unit[] = (raw?.core_org_unit ?? []).map(({ valid_period, ...u }) => ({
      ...u,
      period: parsePeriod(valid_period),
    }));
    const positions: Position[] = (raw?.core_position ?? []).map(({ valid_period, assignments, ...p }) => {
      const list = assignments.map(({ valid_period: vp, ...a }) => ({ ...a, period: parsePeriod(vp) }));
      return { ...p, period: parsePeriod(valid_period), assignments: list, holder: list.find((a) => a.period.active) };
    });
    const unitById = new Map(units.map((u) => [u.id, u]));
    const catalog = (name: string) => (raw?.core_catalog_item ?? []).filter((c) => c.catalog === name);
    return {
      units,
      unitById,
      positions,
      people: raw?.core_person ?? [],
      catalogItems: raw?.core_catalog_item ?? [],
      unitTypes: catalog("UNIT_TYPE"),
      jobTitles: catalog("JOB_TITLE"),
      /** "Phòng Mua hàng › Công ty Điện thoại X" — để phân biệt các vị trí cùng tên. */
      unitPath: (id?: string | null) => {
        const names: string[] = [];
        for (
          let u = id ? unitById.get(id) : undefined;
          u && names.length < 3;
          u = u.parent_id ? unitById.get(u.parent_id) : undefined
        ) {
          names.push(u.name);
        }
        return names.join(" › ");
      },
    };
  }, [q.data]);
  return { ...data, loading: q.loading, error: q.error, reload: q.reload };
};

// ===== Kiểu dữ liệu =====
export type OrgData = ReturnType<typeof useOrgData>;

// ===== Hàm tiện ích =====
/** Người và các bổ nhiệm của họ (lấy từ ghế đã tải sẵn). */
export const assignmentsOf = (org: OrgData, personId: string) =>
  org.positions
    .flatMap((p) => p.assignments.filter((a) => a.person.id === personId).map((a) => ({ a, p })))
    .sort(
      (x, y) =>
        Number(y.a.period.active) - Number(x.a.period.active) ||
        (y.a.period.from ?? "").localeCompare(x.a.period.from ?? ""),
    );

// ===== Hằng số =====
export const SCOPE_LABEL: Record<string, string> = {
  TENANT: "Cả tenant",
  SUBTREE: "Nhánh (đơn vị và cấp dưới)",
  UNIT: "Chỉ một đơn vị",
  SELF: "Chỉ chứng từ của chính mình",
};
