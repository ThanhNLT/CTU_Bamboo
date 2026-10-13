// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import { useEffect, useState } from "react"; // React
import { App, Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Table, Typography } from "antd"; // Ant Design
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons"; // Ant Design Icons
import dayjs, { type Dayjs } from "dayjs"; // Day.js

// ===== Module nội bộ =====
import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { formatMoney } from "../../utils/format";
import { FORM_OPTIONS, INSERT_PR, SUBMIT_PR, UPDATE_PR } from "./queries";

// ===== Kiểu dữ liệu =====
type Item = {
  item_id?: string | null;
  description: string;
  uom: string;
  quantity: number;
  unit_price: number;
  note?: string;
};
export type PrFormValues = {
  title: string;
  description?: string;
  requester_position_id: string;
  category_code?: string | null;
  partner_id?: string | null;
  needed_by?: Dayjs | null;
  items: Item[];
};
type Options = {
  core_assignment: {
    position_id: string;
    assignment_type: string;
    position: { name: string; org_unit: { name: string } };
  }[];
  mdm_partner: { id: string; code: string; name: string; internal_unit_id: string | null }[];
  mdm_item: {
    id: string;
    code: string;
    name: string;
    uom: string;
    category_code: string | null;
    ref_price: number | null;
  }[];
  core_catalog_item: { code: string; name: string }[];
};

// ===== Hằng số =====
const ASSIGNMENT: Record<string, string> = {
  PRIMARY: "giữ chính",
  CONCURRENT: "kiêm nhiệm",
  ACTING: "quyền trưởng",
  CONTRACT: "hợp đồng",
};

// ===== Kiểu dữ liệu =====
type Props = {
  id?: string; // có id: sửa đề nghị nháp / bị trả về
  initial?: Partial<PrFormValues>;
  onSaved: (id: string) => void;
};

// ===== Component =====
export const PurchaseRequestForm = ({ id, initial, onSaved }: Props) => {
  const { message } = App.useApp();
  const { tenant } = useSession();
  const [form] = Form.useForm<PrFormValues>();
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const items: Item[] = Form.useWatch("items", form) ?? [];
  const total = items.reduce((s, i) => s + (Number(i?.quantity) || 0) * (Number(i?.unit_price) || 0), 0);

  useEffect(() => {
    request<Options>(FORM_OPTIONS, { person: tenant.person_id })
      .then((o) => {
        setOptions(o);
        if (!id && o.core_assignment.length > 0 && !form.getFieldValue("requester_position_id")) {
          const primary = o.core_assignment.find((a) => a.assignment_type === "PRIMARY") ?? o.core_assignment[0];
          form.setFieldValue("requester_position_id", primary.position_id);
        }
      })
      .catch((e) => message.error(e.message));
  }, [tenant.person_id, id, form, message]);

  useEffect(() => {
    if (initial) form.setFieldsValue(initial);
  }, [initial, form]);

  const pickItem = (row: number, itemId: string) => {
    const it = options?.mdm_item.find((x) => x.id === itemId);
    if (!it) return;
    const current = form.getFieldValue(["items", row]) as Item;
    form.setFieldValue(["items", row], {
      ...current,
      item_id: it.id,
      description: it.name,
      uom: it.uom,
      unit_price: current?.unit_price || it.ref_price || 0,
    });
    if (!form.getFieldValue("category_code") && it.category_code) form.setFieldValue("category_code", it.category_code);
  };

  const save = async (submit: boolean) => {
    const v = await form.validateFields();
    const header = {
      title: v.title.trim(),
      description: v.description?.trim() || null,
      category_code: v.category_code ?? null,
      partner_id: v.partner_id ?? null,
      needed_by: v.needed_by ? v.needed_by.format("YYYY-MM-DD") : null,
    };
    const lines = v.items.map((i, n) => ({
      line_no: n + 1,
      item_id: i.item_id ?? null,
      description: i.description,
      uom: i.uom,
      quantity: i.quantity,
      unit_price: i.unit_price,
      note: i.note ?? null,
    }));
    setBusy(true);
    try {
      let savedId = id;
      if (id) {
        await request(UPDATE_PR, { id, set: header, items: lines.map((l) => ({ ...l, request_id: id })) });
      } else {
        const r = await request<{ insert_proc_purchase_request_one: { id: string } }>(INSERT_PR, {
          object: {
            ...header,
            requester_position_id: v.requester_position_id,
            purchase_request_items: { data: lines },
          },
        });
        savedId = r.insert_proc_purchase_request_one.id;
      }
      if (submit) {
        await request(SUBMIT_PR, { id: savedId });
        message.success("Đã gửi duyệt");
      } else {
        message.success("Đã lưu nháp");
      }
      onSaved(savedId!);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      disabled={busy}
      initialValues={{ items: [{ description: "", uom: "", quantity: 1, unit_price: 0 }] }}
    >
      <Row gutter={16}>
        <Col xs={24} md={16}>
          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, whitespace: true, message: "Nhập tiêu đề" }]}
          >
            <Input maxLength={200} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name="requester_position_id"
            label="Tư cách lập"
            tooltip="Vị trí bạn lập đề nghị; chuỗi duyệt tính từ vị trí này"
            rules={[{ required: true, message: "Chọn tư cách lập" }]}
          >
            <Select
              disabled={!!id}
              loading={!options}
              options={options?.core_assignment.map((a) => ({
                value: a.position_id,
                label: `${a.position.name} – ${a.position.org_unit.name} (${ASSIGNMENT[a.assignment_type]})`,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="partner_id" label="Nhà cung cấp đề xuất">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={options?.mdm_partner.map((p) => ({
                value: p.id,
                label: `${p.code} – ${p.name}${p.internal_unit_id ? " (nội bộ)" : ""}`,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="category_code" label="Nhóm hàng" tooltip="Một số nhóm hàng có hạn mức duyệt riêng">
            <Select allowClear options={options?.core_catalog_item.map((c) => ({ value: c.code, label: c.name }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="needed_by" label="Ngày cần hàng">
            <DatePicker
              format="DD/MM/YYYY"
              style={{ width: "100%" }}
              disabledDate={(d) => d.isBefore(dayjs(), "day")}
            />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item name="description" label="Mô tả, lý do mua">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Col>
      </Row>

      <Typography.Title level={5}>Dòng hàng</Typography.Title>
      <Form.List
        name="items"
        rules={[
          {
            validator: async (_, v) => {
              if (!v?.length) throw new Error("Cần ít nhất một dòng hàng");
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <>
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={fields}
              scroll={{ x: 900 }}
              columns={[
                { title: "#", width: 40, render: (_, __, i) => i + 1 },
                {
                  title: "Vật tư",
                  width: 220,
                  render: (_, f) => (
                    <Form.Item name={[f.name, "item_id"]} noStyle>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Chọn từ danh mục"
                        style={{ width: "100%" }}
                        onChange={(v: string) => v && pickItem(f.name, v)}
                        options={options?.mdm_item.map((it) => ({ value: it.id, label: `${it.code} – ${it.name}` }))}
                      />
                    </Form.Item>
                  ),
                },
                {
                  title: "Mô tả",
                  render: (_, f) => (
                    <Form.Item name={[f.name, "description"]} noStyle rules={[{ required: true, whitespace: true }]}>
                      <Input placeholder="Mô tả" />
                    </Form.Item>
                  ),
                },
                {
                  title: "ĐVT",
                  width: 90,
                  render: (_, f) => (
                    <Form.Item name={[f.name, "uom"]} noStyle rules={[{ required: true, whitespace: true }]}>
                      <Input />
                    </Form.Item>
                  ),
                },
                {
                  title: "Số lượng",
                  width: 110,
                  render: (_, f) => (
                    <Form.Item name={[f.name, "quantity"]} noStyle rules={[{ required: true }]}>
                      <InputNumber min={0.001} style={{ width: "100%" }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Đơn giá (VNĐ)",
                  width: 160,
                  render: (_, f) => (
                    <Form.Item name={[f.name, "unit_price"]} noStyle rules={[{ required: true }]}>
                      <InputNumber
                        min={0}
                        step={1000}
                        style={{ width: "100%" }}
                        formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                        parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0}
                      />
                    </Form.Item>
                  ),
                },
                {
                  title: "Thành tiền",
                  width: 150,
                  align: "right",
                  render: (_, f) =>
                    formatMoney((Number(items[f.name]?.quantity) || 0) * (Number(items[f.name]?.unit_price) || 0)),
                },
                {
                  title: "",
                  width: 48,
                  render: (_, f) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="Xóa dòng"
                      onClick={() => remove(f.name)}
                    />
                  ),
                },
              ]}
            />
            <Space style={{ marginTop: 8, width: "100%", justifyContent: "space-between" }}>
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({ description: "", uom: "", quantity: 1, unit_price: 0 })}
              >
                Thêm dòng
              </Button>
              <Typography.Text strong>Tổng cộng: {formatMoney(total)}</Typography.Text>
            </Space>
            <Form.ErrorList errors={errors} />
          </>
        )}
      </Form.List>

      <Space style={{ marginTop: 24 }}>
        <Button onClick={() => save(false)} loading={busy}>
          Lưu nháp
        </Button>
        <Button type="primary" onClick={() => save(true)} loading={busy}>
          Lưu và gửi duyệt
        </Button>
      </Space>
    </Form>
  );
};
