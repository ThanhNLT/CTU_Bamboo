// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Hồ sơ tiếp nhận nhân sự: thông tin ứng viên, dữ liệu nhạy cảm (ghi qua Action, mã hóa ở OpenBao), đề xuất
// bổ nhiệm và tên đăng nhập. Danh sách vị trí chỉ là gợi ý: CSDL kiểm tra lại quyền lập và ghế còn trống.
import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { parsePgTimestamp } from "../../utils/format";
import { OB_INSERT, OB_OPTIONS, OB_SAVE_PRIVATE, OB_SUBMIT, OB_UPDATE } from "./queries";
import { CONTRACT_TYPE, GENDER, type Onboarding } from "./types";
import { suggestUsername } from "./username";

export type ObFormValues = {
  full_name: string; gender?: string | null; date_of_birth?: Dayjs | null; phone?: string; work_email?: string;
  education?: string; major?: string;
  national_id?: string; bank_name?: string; bank_account?: string; address?: string;
  requester_position_id: string; target_position_id: string; start_date: Dayjs; contract_type: string;
  salary?: number | null; note?: string; username?: string;
};

type Options = {
  core_assignment: { position_id: string; assignment_type: string; position: { name: string; org_unit: { name: string } } }[];
  core_v_permission_grant: { scope: string; anchor_unit_id: string | null }[];
  core_org_unit: { id: string; name: string; path: string }[];
  core_position: { id: string; name: string; is_head: boolean; org_unit_id: string; valid_period: string;
                   assignments: { valid_period: string }[] }[];
};

// tstzrange dạng ["2025-01-01 00:00:00+07",) → mốc kết thúc (null: không thời hạn).
const rangeEnd = (range: string): Dayjs | null => {
  const upper = range.slice(range.indexOf(",") + 1, -1).replace(/"/g, "").trim();
  return upper ? parsePgTimestamp(upper) : null;
};

type Props = {
  record?: Onboarding;               // có record: sửa hồ sơ nháp / bị trả về
  onSaved: (id: string) => void;
};

export const OnboardingForm = ({ record, onSaved }: Props) => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [form] = Form.useForm<ObFormValues>();
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(Boolean(record?.username));
  const startDate: Dayjs | undefined = Form.useWatch("start_date", form);

  useEffect(() => {
    request<Options>(OB_OPTIONS, { person: tenant.person_id }).then((o) => {
      setOptions(o);
      if (!record && o.core_assignment.length > 0 && !form.getFieldValue("requester_position_id")) {
        const primary = o.core_assignment.find((a) => a.assignment_type === "PRIMARY") ?? o.core_assignment[0];
        form.setFieldValue("requester_position_id", primary.position_id);
      }
    }).catch((e) => message.error(e.message));
  }, [tenant.person_id, record, form, message]);

  useEffect(() => {
    if (!record) return;
    form.setFieldsValue({
      full_name: record.full_name, gender: record.gender, phone: record.phone ?? undefined,
      work_email: record.work_email ?? undefined, education: record.education ?? undefined, major: record.major ?? undefined,
      date_of_birth: record.date_of_birth ? dayjs(record.date_of_birth) : null,
      bank_name: record.bank_name ?? undefined, requester_position_id: record.requester_position_id,
      target_position_id: record.target_position_id, start_date: dayjs(record.start_date),
      contract_type: record.contract_type, salary: record.salary == null ? null : Number(record.salary),
      note: record.note ?? undefined, username: record.username ?? undefined,
    });
  }, [record, form]);

  // Vị trí còn trống từ ngày vào làm, trong đơn vị người dùng được lập hồ sơ (gợi ý; CSDL kiểm tra lại).
  const positions = useMemo(() => {
    if (!options) return [];
    const units = new Map(options.core_org_unit.map((u) => [u.id, u]));
    const allowed = (unitId: string) => options.core_v_permission_grant.some((g) => {
      if (g.scope === "TENANT") return true;
      const anchor = g.anchor_unit_id ? units.get(g.anchor_unit_id) : undefined;
      const unit = units.get(unitId);
      if (!anchor || !unit) return false;
      return g.scope === "UNIT" ? unit.id === anchor.id : unit.path === anchor.path || unit.path.startsWith(`${anchor.path}.`);
    });
    const from = (startDate ?? dayjs()).startOf("day");
    return options.core_position
      .filter((p) => p.id === record?.target_position_id || (allowed(p.org_unit_id)
        && (rangeEnd(p.valid_period) ?? from.add(1, "day")).isAfter(from)
        && !p.assignments.some((a) => { const end = rangeEnd(a.valid_period); return end === null || end.isAfter(from); })))
      .map((p) => ({ value: p.id, label: `${p.name} – ${units.get(p.org_unit_id)?.name ?? ""}${p.is_head ? " (trưởng đơn vị)" : ""}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [options, startDate, record?.target_position_id]);

  const save = async (submit: boolean) => {
    const v = await form.validateFields();
    const fields = {
      full_name: v.full_name.trim(), gender: v.gender ?? null,
      date_of_birth: v.date_of_birth ? v.date_of_birth.format("YYYY-MM-DD") : null,
      phone: v.phone?.trim() || null, work_email: v.work_email?.trim() || null,
      education: v.education?.trim() || null, major: v.major?.trim() || null,
      target_position_id: v.target_position_id, start_date: v.start_date.format("YYYY-MM-DD"),
      contract_type: v.contract_type, salary: v.salary ?? null, note: v.note?.trim() || null,
      bank_name: v.bank_name?.trim() || null, username: v.username?.trim().toLowerCase() || null,
    };
    setBusy(true);
    try {
      let id = record?.id;
      if (id) {
        await request(OB_UPDATE, { id, set: fields });
      } else {
        const r = await request<{ insert_hr_onboarding_request_one: { id: string } }>(OB_INSERT, {
          object: { ...fields, requester_position_id: v.requester_position_id },
        });
        id = r.insert_hr_onboarding_request_one.id;
      }
      // Trường nhạy cảm để trống khi sửa: giữ bản đã lưu.
      const secret = { national_id: v.national_id?.trim() || null, bank_account: v.bank_account?.trim() || null,
                       address: v.address?.trim() || null };
      if (Object.values(secret).some(Boolean)) {
        try {
          await request(OB_SAVE_PRIVATE, { id, ...secret });
        } catch (e) {
          message.error(`Đã lưu hồ sơ nhưng chưa lưu được dữ liệu nhạy cảm: ${(e as Error).message}`);
          onSaved(id!);
          return;
        }
      }
      if (submit) {
        try {
          await request(OB_SUBMIT, { id });
          message.success("Đã gửi duyệt");
        } catch (e) {
          message.error(`Đã lưu nháp nhưng chưa gửi duyệt được: ${(e as Error).message}`);
        }
      } else {
        message.success("Đã lưu nháp");
      }
      onSaved(id!);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasSaved = (masked: string | null | undefined) => (masked ? `Đã lưu ${masked} – để trống nếu không đổi` : undefined);

  return (
    <Form form={form} layout="vertical" disabled={busy} initialValues={{ contract_type: "PROBATION", start_date: dayjs().add(7, "day") }}
          onValuesChange={(changed) => {
            if ("username" in changed) setUsernameTouched(true);
            if ("full_name" in changed && !usernameTouched) form.setFieldValue("username", suggestUsername(changed.full_name ?? ""));
          }}>
      <Card size="small" title="Thông tin ứng viên">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="full_name" label="Họ và tên" rules={[{ required: true, whitespace: true, min: 2, message: "Nhập họ và tên" }]}>
              <Input maxLength={200} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="gender" label="Giới tính">
              <Select allowClear options={Object.entries(GENDER).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="date_of_birth" label="Ngày sinh">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} disabledDate={(d) => d.isAfter(dayjs().subtract(15, "year"))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label="Điện thoại" rules={[{ pattern: /^\+?[0-9 .-]{8,20}$/, message: "Số điện thoại không hợp lệ" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="work_email" label="Email công việc" rules={[{ type: "email", message: "Email không hợp lệ" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}><Form.Item name="education" label="Trình độ"><Input placeholder="Ví dụ: Đại học" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="major" label="Chuyên ngành"><Input /></Form.Item></Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginTop: 16 }}
            title={<Space><LockOutlined />Dữ liệu cá nhân nhạy cảm</Space>}>
        <Typography.Paragraph type="secondary">
          Mã hóa trước khi lưu; người duyệt chỉ thấy bản che. Chỉ phòng nhân sự xem được bản đầy đủ và mỗi lần xem đều ghi nhật ký.
        </Typography.Paragraph>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="national_id" label="Số CCCD" extra={hasSaved(record?.national_id_masked)}
                       rules={[{ required: !record?.national_id_masked, message: "Nhập số CCCD" },
                               { pattern: /^\s*(\d\s*){9}((\d\s*){3})?$/, message: "CCCD gồm 12 chữ số (CMND cũ: 9)" }]}>
              <Input autoComplete="off" inputMode="numeric" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="address" label="Địa chỉ thường trú" extra={hasSaved(record?.address_masked)}>
              <Input autoComplete="off" maxLength={300} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}><Form.Item name="bank_name" label="Ngân hàng"><Input /></Form.Item></Col>
          <Col xs={24} md={12}>
            <Form.Item name="bank_account" label="Số tài khoản" extra={hasSaved(record?.bank_account_masked)}
                       rules={[{ pattern: /^\s*(\d\s*){6,20}$/, message: "Số tài khoản gồm 6–20 chữ số" }]}>
              <Input autoComplete="off" inputMode="numeric" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card size="small" style={{ marginTop: 16 }} title="Đề xuất bổ nhiệm">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="requester_position_id" label="Tư cách lập" rules={[{ required: true, message: "Chọn tư cách lập" }]}>
              <Select disabled={Boolean(record)} loading={!options} options={options?.core_assignment.map((a) => ({
                value: a.position_id, label: `${a.position.name} – ${a.position.org_unit.name}`,
              }))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="start_date" label="Ngày vào làm" rules={[{ required: true, message: "Chọn ngày vào làm" }]}>
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} disabledDate={(d) => d.isBefore(dayjs().startOf("day"))} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="contract_type" label="Loại hợp đồng" rules={[{ required: true }]}>
              <Select options={Object.entries(CONTRACT_TYPE).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="target_position_id" label="Vị trí bổ nhiệm (còn trống từ ngày vào làm)"
                       rules={[{ required: true, message: "Chọn vị trí" }]}
                       extra="Chuỗi duyệt tính từ vị trí này: quản lý trực tiếp của vị trí, rồi giám đốc công ty.">
              <Select showSearch optionFilterProp="label" loading={!options} options={positions}
                      notFoundContent="Không có vị trí trống trong phạm vi bạn được lập hồ sơ" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="salary" label="Lương đề xuất (VNĐ/tháng)">
              <InputNumber min={0} step={500000} style={{ width: "100%" }}
                           formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                           parser={(v) => Number((v ?? "").replace(/\./g, "")) as unknown as 0} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="username" label="Tên đăng nhập (tạo tài khoản khi duyệt xong)"
                       rules={[{ pattern: /^[a-z0-9][a-z0-9._-]{2,49}$/, message: "Chữ thường không dấu, số, dấu chấm, gạch; 3–50 ký tự" }]}
                       extra="Để trống nếu chưa cần tài khoản đăng nhập.">
              <Input autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={1} autoSize /></Form.Item></Col>
        </Row>
      </Card>

      {record?.status === "RETURNED" && <Alert style={{ marginTop: 16 }} type="warning" showIcon
        message="Hồ sơ bị trả về: sửa theo ý kiến người duyệt rồi gửi duyệt lại." />}
      <Space style={{ marginTop: 16 }}>
        <Button onClick={() => save(false)} loading={busy}>Lưu nháp</Button>
        <Button type="primary" onClick={() => save(true)} loading={busy}>Lưu và gửi duyệt</Button>
      </Space>
    </Form>
  );
};
