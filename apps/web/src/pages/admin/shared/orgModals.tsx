import { DatePicker, Form, Input, InputNumber, Radio, Select, Switch, TreeSelect } from "antd";
import type { Dayjs } from "dayjs";

import { adminSave } from "./api";
import { FormModal } from "./FormModal";
import { ASSIGNMENT_LABEL, type OrgData, type Position, type Unit } from "./orgData";
import { toDate } from "./period";
import { useUnitTree } from "./useUnitTree";
import { tr, trf } from "../../../i18n";

type UnitValues = {
  code: string;
  name: string;
  unit_type_id: string;
  parent_id: string;
  is_legal_entity: boolean;
  is_hr: boolean;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const UnitModal = ({
  open,
  org,
  unit,
  parentId,
  onClose,
  onSaved,
}: {
  open: boolean;
  org: OrgData;
  unit?: Unit;
  parentId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const tree = useUnitTree(org, unit?.id);
  return (
    <FormModal<UnitValues>
      open={open}
      title={unit ? trf("Sửa đơn vị {0}", [unit.name]) : tr("Thêm đơn vị")}
      initial={
        unit
          ? {
              code: unit.code,
              name: unit.name,
              unit_type_id: unit.unit_type_id,
              parent_id: unit.parent_id ?? undefined,
              is_legal_entity: unit.is_legal_entity,
              is_hr: unit.is_hr,
              province: unit.province,
              lat: unit.lat,
              lng: unit.lng,
            }
          : { parent_id: parentId, is_legal_entity: false, is_hr: false }
      }
      onCancel={onClose}
      onSubmit={async (v) =>
        onSaved(
          await adminSave("org_unit", {
            id: unit?.id,
            ...v,
            province: v.province ?? null,
            lat: v.lat ?? null,
            lng: v.lng ?? null,
          }),
        )
      }
    >
      {() => (
        <>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[1fr_2fr]">
            <Form.Item
              name="code"
              label={tr("Mã đơn vị")}
              rules={[{ required: true, whitespace: true, message: tr("Nhập mã") }]}
              tooltip={tr("Duy nhất trong tenant; dùng khi nhập từ Excel")}
            >
              <Input placeholder="PHONG_KT" className="font-mono" />
            </Form.Item>
            <Form.Item
              name="name"
              label={tr("Tên đơn vị")}
              rules={[{ required: true, whitespace: true, message: tr("Nhập tên") }]}
            >
              <Input placeholder={tr("Phòng Kỹ thuật")} />
            </Form.Item>
          </div>
          <Form.Item
            name="unit_type_id"
            label={tr("Loại đơn vị")}
            rules={[{ required: true, message: tr("Chọn loại đơn vị") }]}
            extra={tr("Thêm loại mới ở Danh mục & dữ liệu chủ.")}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={org.unitTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          {(!unit || unit.parent_id) && (
            <Form.Item
              name="parent_id"
              label={tr("Đơn vị cha")}
              rules={[{ required: true, message: tr("Chọn đơn vị cha") }]}
              extra={unit ? tr("Đổi đơn vị cha là chuyển cả nhánh; cần quyền ở cả nơi đi và nơi đến.") : undefined}
            >
              <TreeSelect treeData={tree} showSearch treeNodeFilterProp="title" treeDefaultExpandAll={false} />
            </Form.Item>
          )}
          <Form.Item
            name="is_legal_entity"
            label={tr("Là công ty (pháp nhân)")}
            valuePropName="checked"
            extra={tr("Bật cho công ty con: dùng để xác định công ty khi bổ nhiệm hợp đồng, đơn hàng nội bộ.")}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="is_hr"
            label={tr("Là phòng nhân sự của công ty")}
            valuePropName="checked"
            extra={tr("Trưởng phòng nhân sự của công ty duyệt đề nghị điều chuyển nhân sự thuộc công ty.")}
          >
            <Switch />
          </Form.Item>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
            <Form.Item name="province" label={tr("Tỉnh / thành của cơ sở")}>
              <Input placeholder={tr("Bắc Ninh")} />
            </Form.Item>
            <Form.Item name="lat" label={tr("Vĩ độ")}>
              <InputNumber min={-90} max={90} step={0.0001} className="w-full" placeholder="21.1861" />
            </Form.Item>
            <Form.Item
              name="lng"
              label={tr("Kinh độ")}
              extra={tr("Có tọa độ thì đơn vị hiện trên bản đồ Trung tâm điều hành.")}
            >
              <InputNumber min={-180} max={180} step={0.0001} className="w-full" placeholder="106.0763" />
            </Form.Item>
          </div>
        </>
      )}
    </FormModal>
  );
};

type PositionValues = {
  name: string;
  job_title_id?: string;
  is_head: boolean;
  reports_to_id?: string;
  org_unit_id: string;
};

export const PositionModal = ({
  open,
  org,
  position,
  unitId,
  onClose,
  onSaved,
}: {
  open: boolean;
  org: OrgData;
  position?: Position;
  unitId?: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const tree = useUnitTree(org);
  const reportOptions = org.positions
    .filter((p) => p.period.active && p.id !== position?.id)
    .map((p) => ({ value: p.id, label: `${p.name} · ${org.unitById.get(p.org_unit_id)?.name ?? ""}` }));
  return (
    <FormModal<PositionValues>
      open={open}
      title={position ? trf("Sửa vị trí {0}", [position.name]) : tr("Thêm vị trí")}
      initial={
        position
          ? {
              name: position.name,
              job_title_id: position.job_title_id ?? undefined,
              is_head: position.is_head,
              reports_to_id: position.reports_to_id ?? undefined,
              org_unit_id: position.org_unit_id,
            }
          : { org_unit_id: unitId, is_head: false }
      }
      onCancel={onClose}
      onSubmit={async (v) => {
        await adminSave("position", {
          id: position?.id,
          ...v,
          job_title_id: v.job_title_id ?? null,
          reports_to_id: v.reports_to_id ?? null,
        });
        onSaved();
      }}
    >
      {() => (
        <>
          <Form.Item
            name="name"
            label={tr("Tên vị trí (ghế)")}
            rules={[{ required: true, whitespace: true, message: tr("Nhập tên vị trí") }]}
            extra={tr("Quyền gắn với vị trí, không gắn với người (ADR #5): ai ngồi ghế thì có quyền của ghế.")}
          >
            <Input placeholder={tr("Trưởng phòng / Chuyên viên mua hàng 1")} />
          </Form.Item>
          <Form.Item
            name="org_unit_id"
            label={tr("Thuộc đơn vị")}
            rules={[{ required: true, message: tr("Chọn đơn vị") }]}
          >
            <TreeSelect treeData={tree} showSearch treeNodeFilterProp="title" />
          </Form.Item>
          <Form.Item name="job_title_id" label={tr("Chức danh")}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={org.jobTitles.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item
            name="is_head"
            label={tr("Là trưởng đơn vị")}
            valuePropName="checked"
            extra={tr("Mỗi đơn vị một trưởng; trưởng đơn vị nằm trong chuỗi duyệt.")}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="reports_to_id"
            label={tr("Báo cáo cho")}
            extra={tr("Bỏ trống: báo cáo cho trưởng đơn vị (hoặc trưởng đơn vị cha nếu là trưởng).")}
          >
            <Select allowClear showSearch optionFilterProp="label" options={reportOptions} />
          </Form.Item>
        </>
      )}
    </FormModal>
  );
};

type AssignValues = {
  person_id: string;
  position_id: string;
  assignment_type: string;
  valid_from?: Dayjs;
  valid_to?: Dayjs;
  contract_no?: string;
  contract_partner?: string;
};

export const AssignModal = ({
  open,
  org,
  positionId,
  personId,
  onClose,
  onSaved,
}: {
  open: boolean;
  org: OrgData;
  positionId?: string;
  personId?: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const vacant = org.positions
    .filter((p) => p.period.active && (!p.holder || p.id === positionId))
    .map((p) => ({ value: p.id, label: `${p.name} · ${org.unitPath(p.org_unit_id)}` }));
  return (
    <FormModal<AssignValues>
      open={open}
      title={tr("Bổ nhiệm vào vị trí")}
      okText={tr("Bổ nhiệm")}
      initial={{ position_id: positionId, person_id: personId, assignment_type: "PRIMARY" }}
      onCancel={onClose}
      onSubmit={async (v) => {
        await adminSave("assignment", {
          ...v,
          valid_from: toDate(v.valid_from),
          valid_to: toDate(v.valid_to),
          contract_no: v.contract_no ?? null,
          contract_partner: v.contract_partner ?? null,
        });
        onSaved();
      }}
    >
      {(form) => (
        <>
          <Form.Item
            name="person_id"
            label={tr("Người")}
            rules={[{ required: true, message: tr("Chọn người") }]}
            extra={personId ? undefined : tr("Chưa có trong danh sách? Thêm ở trang Người dùng.")}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={Boolean(personId)}
              options={org.people.map((p) => ({
                value: p.id,
                label: p.employee_code ? `${p.full_name} · ${p.employee_code}` : p.full_name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="position_id"
            label={tr("Vị trí còn trống")}
            rules={[{ required: true, message: tr("Chọn vị trí") }]}
          >
            <Select showSearch optionFilterProp="label" disabled={Boolean(positionId)} options={vacant} />
          </Form.Item>
          <Form.Item name="assignment_type" label={tr("Loại bổ nhiệm")} rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={Object.entries(ASSIGNMENT_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="valid_from" label={tr("Từ ngày")} extra={tr("Bỏ trống: từ bây giờ")}>
              <DatePicker format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
            <Form.Item noStyle dependencies={["assignment_type"]}>
              {() => (
                <Form.Item
                  name="valid_to"
                  label={tr("Đến ngày")}
                  rules={[
                    {
                      required: form.getFieldValue("assignment_type") === "CONTRACT",
                      message: tr("Hợp đồng phải có ngày kết thúc"),
                    },
                  ]}
                >
                  <DatePicker format="DD/MM/YYYY" className="w-full" />
                </Form.Item>
              )}
            </Form.Item>
          </div>
          <Form.Item noStyle dependencies={["assignment_type"]}>
            {() =>
              form.getFieldValue("assignment_type") === "CONTRACT" && (
                <div className="grid grid-cols-2 gap-x-4">
                  <Form.Item
                    name="contract_no"
                    label={tr("Số hợp đồng")}
                    rules={[{ required: true, whitespace: true, message: tr("Nhập số hợp đồng") }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="contract_partner" label={tr("Bên thuê / đối tác")}>
                    <Input />
                  </Form.Item>
                </div>
              )
            }
          </Form.Item>
          <p className="m-0 text-[12px] text-muted">
            {tr(
              "Mỗi người chỉ giữ chính một ghế tại một thời điểm; hợp đồng không giữ ghế trưởng và phải ở công ty khác công ty giữ chính (ADR #29).",
            )}
          </p>
        </>
      )}
    </FormModal>
  );
};
