// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Create } from "@refinedev/antd";
import { useGo } from "@refinedev/core";
import { App, Button, DatePicker, Form, Input, Select, Space, Typography } from "antd";
import dayjs from "dayjs";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { rangeEnd } from "./vacancy";
import { TR_CREATE, TR_OPTIONS, TR_SUBMIT, TR_TENANT_UNITS, TR_TENANTS, TRO_CREATE, TRO_SUBMIT } from "./queries";
import { tr, trf } from "../../i18n";

type Assignment = {
  id: string;
  person_id: string;
  position_id: string;
  valid_period: string;
  person: { full_name: string; employee_code: string | null };
  position: { name: string; org_unit: { name: string } };
};

type Unit = { id: string; name: string; path?: string };

type Options = {
  core_assignment: Assignment[];
  core_org_unit: Unit[];
};

type FormValues = {
  assignment_id: string;
  tenant_id: string;
  target_unit_id: string;
  effective_date: dayjs.Dayjs;
  reason: string;
};

// Kế hoạch điều chuyển phải lập trước ít nhất 14 ngày
const LEAD_DAYS = 14;

export const TransferCreate = () => {
  const go = useGo();
  const { message } = App.useApp();
  const { tenant } = useSession();
  const own = tenant.tenant_id;
  const [form] = Form.useForm<FormValues>();
  const [options, setOptions] = useState<Options | null>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [remoteUnits, setRemoteUnits] = useState<Unit[]>([]);
  const [busy, setBusy] = useState(false);
  const targetTenant = Form.useWatch("tenant_id", form);
  const crossTenant = Boolean(targetTenant) && targetTenant !== own;

  useEffect(() => {
    request<Options>(TR_OPTIONS)
      .then(setOptions)
      .catch((e: Error) => message.error(e.message));
    request<{ transfer_tenants: { tenants: { id: string; name: string }[] } }>(TR_TENANTS)
      .then((r) => setTenants(r.transfer_tenants.tenants))
      .catch((e: Error) => message.error(e.message));
  }, [message]);

  useEffect(() => {
    if (!crossTenant) {
      setRemoteUnits([]);
      return;
    }
    request<{ transfer_target_units: { units: Unit[] } }>(TR_TENANT_UNITS, { tenant: targetTenant })
      .then((r) => setRemoteUnits(r.transfer_target_units.units))
      .catch((e: Error) => message.error(e.message));
  }, [crossTenant, targetTenant, message]);

  // Chỉ bổ nhiệm đang hiệu lực mới điều chuyển được
  const current = (options?.core_assignment ?? []).filter((a) => {
    const end = rangeEnd(a.valid_period);
    return end === null || end.isAfter(dayjs());
  });
  const units = crossTenant ? remoteUnits : (options?.core_org_unit ?? []);

  const save = async (submit: boolean) => {
    const values = await form.validateFields();
    const assignment = current.find((a) => a.id === values.assignment_id);
    if (!assignment) return;
    setBusy(true);
    const vars = {
      person: assignment.person_id,
      source: assignment.position_id,
      unit: values.target_unit_id,
      effective: values.effective_date.format("YYYY-MM-DD"),
      reason: values.reason.trim(),
    };
    try {
      if (crossTenant) {
        const r = await request<{ create_transfer_out: { request_id: string } }>(TRO_CREATE, {
          ...vars,
          tenant: values.tenant_id,
        });
        const id = r.create_transfer_out.request_id;
        if (submit) {
          await request(TRO_SUBMIT, { id });
          message.success(tr("Đã gửi duyệt đề nghị điều chuyển liên tập đoàn"));
        } else {
          message.success(tr("Đã lưu nháp đề nghị điều chuyển liên tập đoàn"));
        }
        go({ to: { resource: "hr_transfer_out", action: "show", id } });
        return;
      }
      const r = await request<{ create_transfer_request: { request_id: string } }>(TR_CREATE, vars);
      const id = r.create_transfer_request.request_id;
      if (submit) {
        await request(TR_SUBMIT, { id });
        message.success(tr("Đã gửi duyệt đề nghị điều chuyển"));
      } else {
        message.success(tr("Đã lưu nháp đề nghị điều chuyển"));
      }
      go({ to: { resource: "hr_transfer_request", action: "show", id } });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Create title={tr("Lập đề nghị điều chuyển nhân sự")} footerButtons={() => null}>
      <Form form={form} layout="vertical" style={{ maxWidth: 720 }} initialValues={{ tenant_id: own }}>
        <Form.Item name="assignment_id" label={tr("Nhân viên và vị trí hiện tại")} rules={[{ required: true }]}>
          <Select
            showSearch
            loading={!options}
            optionFilterProp="label"
            options={current.map((a) => ({
              value: a.id,
              label: `${a.person.full_name}${a.person.employee_code ? ` (${a.person.employee_code})` : ""} – ${a.position.name}, ${a.position.org_unit.name}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="tenant_id"
          label={tr("Tenant nơi đến")}
          extra={tr(
            "Chọn tenant khác trong cùng tập đoàn để điều chuyển liên tập đoàn; tenant này không đổi thì là điều chuyển nội bộ.",
          )}
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: own, label: tr("Trong tenant hiện tại (nội bộ)") },
              ...tenants.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="target_unit_id" label={tr("Đơn vị tiếp nhận")} rules={[{ required: true }]}>
          <Select
            showSearch
            optionFilterProp="label"
            loading={!options}
            options={units.map((u) => ({ value: u.id, label: u.name }))}
          />
        </Form.Item>
        <Form.Item
          name="effective_date"
          label={tr("Ngày chuyển")}
          extra={trf("Phải cách hôm nay ít nhất {0} ngày để chuẩn bị hồ sơ và bàn giao công việc.", [LEAD_DAYS])}
          rules={[{ required: true }]}
        >
          <DatePicker
            style={{ width: "100%" }}
            format="DD/MM/YYYY"
            disabledDate={(d) => d.isBefore(dayjs().add(LEAD_DAYS, "day").startOf("day"))}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label={tr("Lý do / nguyện vọng")}
          rules={[{ required: true, whitespace: true, message: tr("Phải ghi lý do") }]}
        >
          <Input.TextArea rows={3} maxLength={2000} showCount />
        </Form.Item>
        <Typography.Paragraph type="secondary">
          {crossTenant
            ? tr("Đề nghị đi qua tenant nguồn, tenant nơi đến, rồi trưởng phòng nhân sự tập đoàn quyết định.")
            : tr(
                "Trưởng đơn vị tiếp nhận sẽ chọn vị trí trong đơn vị và duyệt; sau đó trưởng phòng nhân sự của công ty duyệt.",
              )}
        </Typography.Paragraph>
        <Space>
          <Button onClick={() => void save(false)} disabled={busy}>
            {tr("Lưu nháp")}
          </Button>
          <Button type="primary" onClick={() => void save(true)} loading={busy}>
            {tr("Gửi duyệt")}
          </Button>
        </Space>
      </Form>
    </Create>
  );
};
