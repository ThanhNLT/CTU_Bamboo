// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import {
  Alert,
  App,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Spin,
  Switch,
  Table,
  TreeSelect,
} from "antd";
import { FileSpreadsheet, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { ProposedPartners } from "./ProposedPartners";
import { bambooTableTheme, Dot, primaryButtonClass, SearchInput, secondaryButtonClass } from "../../../components/ui";
import { formatMoney } from "../../../utils/format";
import { fold } from "../../../utils/text";
import { AdminHeader, NoAccess } from "../shared/AdminHeader";
import { adminSave, type ImportKind } from "../shared/api";
import { FormModal } from "../shared/FormModal";
import { ImportModal } from "../shared/ImportModal";
import { useOrgData } from "../shared/orgData";
import { useUnitTree } from "../shared/useUnitTree";
import { useGql } from "../shared/useGql";
import { MDM, ORG, usePermissions } from "../shared/usePermissions";

type Tab = "UNIT_TYPE" | "JOB_TITLE" | "ITEM_CATEGORY" | "partner" | "item";

const TABS: { key: Tab; label: string; permission: string; hint: string }[] = [
  {
    key: "UNIT_TYPE",
    label: "Loại đơn vị",
    permission: ORG,
    hint: "Tập đoàn, công ty, khối, phòng, tổ… — dùng khi thêm đơn vị.",
  },
  {
    key: "JOB_TITLE",
    label: "Chức danh",
    permission: ORG,
    hint: "Gắn cho vị trí (ghế); quy tắc duyệt có thể dựa vào chức danh.",
  },
  {
    key: "ITEM_CATEGORY",
    label: "Nhóm vật tư",
    permission: MDM,
    hint: "Phân nhóm vật tư; quy tắc duyệt mua sắm theo nhóm.",
  },
  {
    key: "partner",
    label: "Nhà cung cấp",
    permission: MDM,
    hint: "Nhà cung cấp bên ngoài, hoặc công ty trong tập đoàn (đơn hàng nội bộ).",
  },
  { key: "item", label: "Vật tư", permission: MDM, hint: "Hàng hóa, dịch vụ dùng trong đề nghị mua sắm." },
];

const DATA = `
  query AdminCatalog {
    core_catalog_item(order_by: [{ catalog: asc }, { code: asc }]) { id catalog code name }
    mdm_partner(order_by: { code: asc }) { id code name tax_code address email phone internal_unit_id is_active internal_unit { name } }
    mdm_item(order_by: { code: asc }) { id code name uom category_code ref_price is_active }
  }
`;

type Catalog = { id: string; catalog: string; code: string; name: string };
type Partner = {
  id: string;
  code: string;
  name: string;
  tax_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  internal_unit_id: string | null;
  is_active: boolean;
  internal_unit: { name: string } | null;
};
type Item = {
  id: string;
  code: string;
  name: string;
  uom: string;
  category_code: string | null;
  ref_price: number | null;
  is_active: boolean;
};
type Data = { core_catalog_item: Catalog[]; mdm_partner: Partner[]; mdm_item: Item[] };

const Active = ({ on }: { on: boolean }) => (
  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-body">
    <Dot tone={on ? "success" : "neutral"} /> {on ? "Đang dùng" : "Ngừng dùng"}
  </span>
);

export const CatalogPage = () => {
  const { message } = App.useApp();
  const perms = usePermissions();
  const q = useGql<Data>(DATA);
  const org = useOrgData();
  const tree = useUnitTree(org);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ row?: Record<string, unknown> }>();
  const [importing, setImporting] = useState(false);

  if (!perms || (q.loading && !q.data))
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  const tabs = TABS.filter((t) => perms.has(t.permission));
  if (!tabs.length) return <NoAccess permission={`${ORG} hoặc ${MDM}`} />;
  const tab = tabs.find((t) => t.key === params.get("tab")) ?? tabs[0];
  const setTab = (key: Tab) => {
    setQuery("");
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("tab", key);
        return next;
      },
      { replace: true },
    );
  };

  const f = fold(query.trim());
  const match = (...v: (string | null | undefined)[]) => !f || fold(v.filter(Boolean).join(" ")).includes(f);
  const catalogRows = (q.data?.core_catalog_item ?? []).filter((c) => c.catalog === tab.key && match(c.code, c.name));
  const partners = (q.data?.mdm_partner ?? []).filter((p) => match(p.code, p.name, p.tax_code));
  const items = (q.data?.mdm_item ?? []).filter((i) => match(i.code, i.name, i.category_code));
  const categories = (q.data?.core_catalog_item ?? []).filter((c) => c.catalog === "ITEM_CATEGORY");
  const isCatalog = tab.key !== "partner" && tab.key !== "item";
  const importKind: ImportKind = isCatalog ? "catalog_item" : (tab.key as ImportKind);
  const count = isCatalog ? catalogRows.length : tab.key === "partner" ? partners.length : items.length;
  const close = () => setEditing(undefined);
  const saved = (text: string) => {
    message.success(text);
    close();
    void q.reload();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <AdminHeader
        title="Danh mục & dữ liệu chủ"
        subtitle="Danh mục dùng chung của tenant · mã là khóa, nhập lại cùng mã là cập nhật"
        actions={
          <>
            <button type="button" className={secondaryButtonClass} onClick={() => setImporting(true)}>
              <FileSpreadsheet className="h-4 w-4 text-body" strokeWidth={1.75} aria-hidden /> Nhập từ Excel
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => setEditing({})}>
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Thêm {tab.label.toLowerCase()}
            </button>
          </>
        }
      />
      {q.error && <Alert type="error" showIcon message="Không tải được danh mục" description={q.error} />}

      <div className="flex flex-col gap-3">
        <Segmented<Tab>
          value={tab.key}
          onChange={setTab}
          options={tabs.map((t) => ({ value: t.key, label: t.label }))}
          className="self-start"
        />
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="w-full sm:w-[320px]"
            value={query}
            onChange={setQuery}
            placeholder={`Tìm ${tab.label.toLowerCase()} theo mã, tên`}
          />
          <span className="text-[12.5px] text-muted">{tab.hint}</span>
        </div>
      </div>

      {tab.key === "partner" && <ProposedPartners onAdopted={() => void q.reload()} />}

      <section className="rounded-2xl border border-line bg-surface px-3 pb-3 pt-1 shadow-card" aria-label={tab.label}>
        <div className="px-2 pb-1 pt-2 text-[12px] tabular-nums text-muted">{count} mục</div>
        <ConfigProvider theme={bambooTableTheme}>
          {isCatalog && (
            <Table<Catalog>
              rowKey="id"
              size="middle"
              dataSource={catalogRows}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              onRow={(r) => ({ onClick: () => setEditing({ row: r }), style: { cursor: "pointer" } })}
              columns={[
                {
                  title: "Mã",
                  dataIndex: "code",
                  width: 220,
                  render: (v: string) => <span className="font-mono text-[12px] text-body">{v}</span>,
                },
                {
                  title: "Tên",
                  dataIndex: "name",
                  render: (v: string) => <span className="font-medium text-ink">{v}</span>,
                },
              ]}
            />
          )}
          {tab.key === "partner" && (
            <Table<Partner>
              rowKey="id"
              size="middle"
              dataSource={partners}
              scroll={{ x: 820 }}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              onRow={(r) => ({ onClick: () => setEditing({ row: r }), style: { cursor: "pointer" } })}
              columns={[
                {
                  title: "Mã",
                  dataIndex: "code",
                  width: 140,
                  render: (v: string) => <span className="font-mono text-[12px] text-body">{v}</span>,
                },
                {
                  title: "Nhà cung cấp",
                  render: (_, p) => (
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">{p.name}</span>
                      {p.internal_unit && (
                        <span className="text-[11.5px] text-bamboo-700">Nội bộ · {p.internal_unit.name}</span>
                      )}
                    </span>
                  ),
                },
                {
                  title: "Mã số thuế",
                  dataIndex: "tax_code",
                  width: 140,
                  render: (v: string | null) => <span className="tabular-nums text-body">{v ?? "—"}</span>,
                },
                {
                  title: "Liên hệ",
                  width: 220,
                  render: (_, p) => (
                    <span className="text-[12.5px] text-body">
                      {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  ),
                },
                { title: "Trạng thái", dataIndex: "is_active", width: 130, render: (v: boolean) => <Active on={v} /> },
              ]}
            />
          )}
          {tab.key === "item" && (
            <Table<Item>
              rowKey="id"
              size="middle"
              dataSource={items}
              scroll={{ x: 760 }}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              onRow={(r) => ({ onClick: () => setEditing({ row: r }), style: { cursor: "pointer" } })}
              columns={[
                {
                  title: "Mã",
                  dataIndex: "code",
                  width: 140,
                  render: (v: string) => <span className="font-mono text-[12px] text-body">{v}</span>,
                },
                {
                  title: "Vật tư",
                  dataIndex: "name",
                  render: (v: string) => <span className="font-medium text-ink">{v}</span>,
                },
                { title: "ĐVT", dataIndex: "uom", width: 90 },
                {
                  title: "Nhóm",
                  dataIndex: "category_code",
                  width: 160,
                  render: (v: string | null) => categories.find((c) => c.code === v)?.name ?? v ?? "—",
                },
                {
                  title: "Giá tham khảo",
                  dataIndex: "ref_price",
                  width: 150,
                  align: "right",
                  render: (v: number | null) => (
                    <span className="tabular-nums">{v == null ? "—" : formatMoney(v)}</span>
                  ),
                },
                { title: "Trạng thái", dataIndex: "is_active", width: 130, render: (v: boolean) => <Active on={v} /> },
              ]}
            />
          )}
        </ConfigProvider>
      </section>

      {isCatalog && (
        <FormModal<{ code: string; name: string }>
          open={Boolean(editing)}
          title={editing?.row ? `Sửa ${tab.label.toLowerCase()}` : `Thêm ${tab.label.toLowerCase()}`}
          initial={(editing?.row as Partial<{ code: string; name: string }>) ?? {}}
          onCancel={close}
          onSubmit={async (v) => {
            await adminSave("catalog_item", { id: editing?.row?.id, catalog: tab.key, ...v });
            saved("Đã lưu.");
          }}
        >
          {() => (
            <>
              <Form.Item
                name="code"
                label="Mã"
                rules={[{ required: true, pattern: /^[A-Za-z0-9_.-]+$/, message: "Mã không dấu, không khoảng trắng" }]}
              >
                <Input className="font-mono" placeholder="TRUONG_PHONG" />
              </Form.Item>
              <Form.Item name="name" label="Tên" rules={[{ required: true, whitespace: true, message: "Nhập tên" }]}>
                <Input />
              </Form.Item>
            </>
          )}
        </FormModal>
      )}
      {tab.key === "partner" && (
        <FormModal<Partial<Partner>>
          open={Boolean(editing)}
          title={editing?.row ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
          width={640}
          initial={(editing?.row as Partial<Partner>) ?? { is_active: true }}
          onCancel={close}
          onSubmit={async (v) => {
            await adminSave("partner", { id: editing?.row?.id, ...v, internal_unit_id: v.internal_unit_id ?? null });
            saved("Đã lưu nhà cung cấp.");
          }}
        >
          {() => (
            <>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[1fr_2fr]">
                <Form.Item name="code" label="Mã" rules={[{ required: true, whitespace: true, message: "Nhập mã" }]}>
                  <Input className="font-mono" />
                </Form.Item>
                <Form.Item name="name" label="Tên" rules={[{ required: true, whitespace: true, message: "Nhập tên" }]}>
                  <Input />
                </Form.Item>
              </div>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                <Form.Item name="tax_code" label="Mã số thuế">
                  <Input />
                </Form.Item>
                <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Email không hợp lệ" }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="phone" label="Điện thoại">
                  <Input />
                </Form.Item>
              </div>
              <Form.Item name="address" label="Địa chỉ">
                <Input />
              </Form.Item>
              <Form.Item
                name="internal_unit_id"
                label="Là công ty trong tập đoàn"
                extra="Chọn đơn vị bán: đề nghị mua từ nhà cung cấp này tự sinh đơn hàng nội bộ (ADR #42)."
              >
                <TreeSelect
                  allowClear
                  treeData={tree}
                  showSearch
                  treeNodeFilterProp="title"
                  placeholder="Nhà cung cấp bên ngoài"
                />
              </Form.Item>
              <Form.Item name="is_active" label="Đang dùng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
        </FormModal>
      )}
      {tab.key === "item" && (
        <FormModal<Partial<Item>>
          open={Boolean(editing)}
          title={editing?.row ? "Sửa vật tư" : "Thêm vật tư"}
          initial={(editing?.row as Partial<Item>) ?? { is_active: true }}
          onCancel={close}
          onSubmit={async (v) => {
            await adminSave("item", {
              id: editing?.row?.id,
              ...v,
              category_code: v.category_code ?? null,
              ref_price: v.ref_price ?? null,
            });
            saved("Đã lưu vật tư.");
          }}
        >
          {() => (
            <>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[1fr_2fr]">
                <Form.Item name="code" label="Mã" rules={[{ required: true, whitespace: true, message: "Nhập mã" }]}>
                  <Input className="font-mono" />
                </Form.Item>
                <Form.Item name="name" label="Tên" rules={[{ required: true, whitespace: true, message: "Nhập tên" }]}>
                  <Input />
                </Form.Item>
              </div>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                <Form.Item
                  name="uom"
                  label="Đơn vị tính"
                  rules={[{ required: true, whitespace: true, message: "Nhập ĐVT" }]}
                >
                  <Input placeholder="cái" />
                </Form.Item>
                <Form.Item name="category_code" label="Nhóm vật tư">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={categories.map((c) => ({ value: c.code, label: c.name }))}
                  />
                </Form.Item>
                <Form.Item name="ref_price" label="Giá tham khảo">
                  <InputNumber<number>
                    className="w-full"
                    min={0}
                    step={1000}
                    formatter={(v) => `${v ?? ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                    parser={(v) => Number((v ?? "").replace(/\./g, ""))}
                  />
                </Form.Item>
              </div>
              <Form.Item name="is_active" label="Đang dùng" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          )}
        </FormModal>
      )}
      {importing && (
        <ImportModal
          open
          kind={importKind}
          label={isCatalog ? "danh mục" : tab.label.toLowerCase()}
          onClose={() => setImporting(false)}
          onDone={() => void q.reload()}
        />
      )}
    </div>
  );
};

export default CatalogPage;
