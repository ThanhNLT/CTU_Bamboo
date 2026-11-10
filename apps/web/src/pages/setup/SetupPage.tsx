import {
  Alert,
  App,
  AutoComplete,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Switch,
  Upload,
  type FormInstance,
} from "antd";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Check,
  CircleUser,
  ClipboardCopy,
  FileSignature,
  LayoutGrid,
  Network,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { cn } from "../../utils/cn";
import {
  applicationPdfUrl,
  createApplication,
  fileToBase64,
  finishSetup,
  setupStatus,
  type Application,
  type Registration,
  type SetupResult,
  type SetupStatus,
  type SizeBand,
} from "./api";
import { AuthShell } from "./AuthShell";
import { HEAVY_MODULES, INDUSTRIES, industryOf, ROLES, SIZES, suggestUsername, UNIT_TYPES } from "./presets";
import { tr, trf } from "../../i18n";

const DRAFT_KEY = "bamboo.signup";
const CURRENT_YEAR = new Date().getFullYear();

const EMPTY: Registration = {
  owner: { full_name: "", username: "", title: tr("Giám đốc") },
  company: { legal_name: "", tax_code: "" },
  size_band: "1-10",
  flow: "quick",
  units: [],
  members: [],
  modules: [],
};

const readDraft = (): Registration => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Registration) };
  } catch {}
  return EMPTY;
};
const saveDraft = (d: Registration | null) => {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
};

const newKey = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const req = (label: string) => [{ required: true, whitespace: true, message: trf("Nhập {0}", [label]) }];
const USERNAME_RULE = {
  pattern: /^[a-z0-9][a-z0-9._-]{2,59}$/,
  message: tr("Chữ thường không dấu, số, dấu chấm, gạch; 3–60 ký tự"),
};
const PHONE_RULE = { pattern: /^\+?[0-9 .-]{8,20}$/, message: tr("Số điện thoại không hợp lệ") };

type StepKey = "profile" | "company" | "size" | "units" | "members" | "tools" | "review";
const STEP_INFO: Record<StepKey, { title: string; subtitle: string; icon: LucideIcon }> = {
  profile: { title: tr("Bạn là ai?"), subtitle: tr("Bạn sẽ là chủ sở hữu tài khoản doanh nghiệp."), icon: CircleUser },
  company: { title: tr("Doanh nghiệp"), subtitle: tr("Thông tin để quản lý và xuất chứng từ."), icon: Building2 },
  size: { title: tr("Quy mô"), subtitle: tr("Chúng tôi chỉ hỏi những gì doanh nghiệp bạn cần."), icon: LayoutGrid },
  units: {
    title: tr("Phòng ban"),
    subtitle: tr("Cơ cấu cấp một; dựng chi tiết hơn sau khi đăng nhập."),
    icon: Network,
  },
  members: { title: tr("Thành viên"), subtitle: tr("Tạo tài khoản và giao quyền cho từng người."), icon: Users },
  tools: { title: tr("Công cụ"), subtitle: tr("Bật những gì bạn dùng; bật thêm bất cứ lúc nào."), icon: Boxes },
  review: { title: tr("Xác nhận"), subtitle: tr("Xem lại rồi tạo tài khoản doanh nghiệp."), icon: Check },
};

const ProfileStep = ({ form, draft }: { form: FormInstance; draft: Registration }) => (
  <Form form={form} layout="vertical" requiredMark={false} className="auth-form" initialValues={draft.owner}>
    <Form.Item name="full_name" label={tr("Họ và tên")} rules={req(tr("họ tên"))}>
      <Input size="large" placeholder={tr("Nguyễn Văn An")} autoComplete="name" autoFocus />
    </Form.Item>
    <div className="grid gap-x-4 sm:grid-cols-2">
      <Form.Item name="birth_year" label={tr("Năm sinh")}>
        <InputNumber
          size="large"
          style={{ width: "100%" }}
          min={1900}
          max={CURRENT_YEAR - 15}
          controls={false}
          placeholder="1985"
        />
      </Form.Item>
      <Form.Item name="title" label={tr("Chức vụ")} rules={req(tr("chức vụ"))}>
        <AutoComplete
          size="large"
          options={[
            tr("Giám đốc"),
            tr("Tổng giám đốc"),
            tr("Chủ doanh nghiệp"),
            tr("Chủ hộ kinh doanh"),
            tr("Chủ tịch HĐQT"),
          ].map((value) => ({ value }))}
        />
      </Form.Item>
      <Form.Item name="phone" label={tr("Điện thoại")} rules={[PHONE_RULE]}>
        <Input size="large" inputMode="tel" autoComplete="tel" placeholder="0912 345 678" />
      </Form.Item>
      <Form.Item name="email" label="Email" rules={[{ type: "email", message: tr("Email không hợp lệ") }]}>
        <Input size="large" inputMode="email" autoComplete="email" placeholder="an@congty.vn" />
      </Form.Item>
    </div>
    <Form.Item
      name="username"
      label={tr("Tên đăng nhập")}
      rules={[...req(tr("tên đăng nhập")), USERNAME_RULE]}
      normalize={(v: string) => v?.toLowerCase().trim()}
      extra={tr("Lần đăng nhập đầu, bạn đặt mật khẩu mới và cài mã xác thực hai lớp trên điện thoại.")}
    >
      <Input
        size="large"
        autoComplete="username"
        placeholder="an.nguyen"
        onFocus={() => {
          if (!form.getFieldValue("username") && form.getFieldValue("full_name"))
            form.setFieldValue("username", suggestUsername(form.getFieldValue("full_name"), new Set()));
        }}
      />
    </Form.Item>
  </Form>
);

const CompanyStep = ({ form, draft }: { form: FormInstance; draft: Registration }) => (
  <Form form={form} layout="vertical" requiredMark={false} className="auth-form" initialValues={draft.company}>
    <Form.Item name="legal_name" label={tr("Tên doanh nghiệp")} rules={req(tr("tên doanh nghiệp"))}>
      <Input size="large" placeholder={tr("Công ty TNHH Minh Anh")} autoFocus />
    </Form.Item>
    <div className="grid gap-x-4 sm:grid-cols-2">
      <Form.Item
        name="tax_code"
        label={tr("Mã số thuế")}
        rules={[
          ...req(tr("mã số thuế")),
          { pattern: /^(\d{10}(-\d{3})?|\d{12})$/, message: tr("10 chữ số (13 với chi nhánh, 12 với hộ kinh doanh)") },
        ]}
        normalize={(v: string) => v?.replace(/\s/g, "")}
      >
        <Input size="large" inputMode="numeric" placeholder="0312345678" />
      </Form.Item>
      <Form.Item name="industry" label={tr("Lĩnh vực kinh doanh")} rules={req(tr("lĩnh vực"))}>
        <Select
          size="large"
          showSearch
          optionFilterProp="label"
          placeholder={tr("Chọn hoặc gõ để tìm")}
          options={INDUSTRIES.map((i) => ({ value: i.label, label: i.label }))}
        />
      </Form.Item>
    </div>
    <Form.Item name="address" label={tr("Địa chỉ trụ sở")}>
      <Input size="large" placeholder={tr("Số nhà, đường, phường/xã, tỉnh/thành phố")} autoComplete="street-address" />
    </Form.Item>
  </Form>
);

const SizeStep = ({ draft, onChange }: { draft: Registration; onChange: (d: Partial<Registration>) => void }) => {
  const suggested = SIZES.find((s) => s.value === draft.size_band)?.flow ?? "quick";
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label={tr("Số người trong doanh nghiệp")} className="grid gap-3 sm:grid-cols-2">
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={draft.size_band === s.value}
            className="auth-tile flex-col"
            onClick={() => onChange({ size_band: s.value as SizeBand, flow: s.flow })}
          >
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{s.label}</span>
            <span className="text-[13px] text-muted">{s.hint}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-body">{tr("Cách thiết lập")}</p>
        <div role="radiogroup" aria-label={tr("Cách thiết lập")} className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["quick", "Nhanh", tr("Thêm thành viên và giao quyền ngay; phòng ban dựng sau nếu cần.")],
              ["detailed", tr("Chi tiết"), tr("Khai phòng ban, người phụ trách và quyền của từng người.")],
            ] as const
          ).map(([value, label, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.flow === value}
              className="auth-tile flex-col"
              onClick={() => onChange({ flow: value })}
            >
              <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {label}
                {suggested === value && (
                  <span className="rounded-full bg-bamboo-100 px-2 py-0.5 text-[11px] font-semibold text-bamboo-700">
                    {tr("Gợi ý")}
                  </span>
                )}
              </span>
              <span className="text-[13px] leading-snug text-muted">{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const UnitsStep = ({ form, draft }: { form: FormInstance; draft: Registration }) => {
  const industry = industryOf(draft.company.industry);
  const applyPreset = () =>
    form.setFieldValue(
      "units",
      (industry ?? INDUSTRIES[INDUSTRIES.length - 1]).units.map((u) => ({ ...u, key: newKey() })),
    );
  useEffect(() => {
    if (!form.getFieldValue("units")?.length) applyPreset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className="auth-form"
      initialValues={{ units: draft.units }}
    >
      <Form.List
        name="units"
        rules={[
          {
            validator: async (_, units) => {
              if (!units?.length)
                throw new Error(tr("Thêm ít nhất một phòng ban, hoặc quay lại chọn cách thiết lập nhanh"));
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.key} className="flex items-start gap-2">
                <Form.Item name={[field.name, "key"]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  name={[field.name, "name"]}
                  rules={req(tr("tên phòng ban"))}
                  className="flex-1"
                  style={{ marginBottom: 0 }}
                >
                  <Input size="large" placeholder={tr("Phòng Kinh doanh")} aria-label={tr("Tên phòng ban")} />
                </Form.Item>
                <Form.Item name={[field.name, "type"]} className="w-36" style={{ marginBottom: 0 }}>
                  <Select size="large" options={UNIT_TYPES} aria-label={tr("Loại đơn vị")} />
                </Form.Item>
                <button
                  type="button"
                  aria-label={tr("Xóa phòng ban")}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  onClick={() => remove(field.name)}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <Form.ErrorList errors={errors} />
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="auth-pill auth-pill--ghost h-9 px-4 text-[13px]"
                onClick={() => add({ key: newKey(), name: "", type: "PHONG" })}
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> {tr(" Thêm phòng ban")}
              </button>
              <button type="button" className="auth-pill auth-pill--ghost h-9 px-4 text-[13px]" onClick={applyPreset}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} /> {tr(" Gợi ý cho ")}{" "}
                {industry?.label ?? tr("doanh nghiệp")}
              </button>
            </div>
          </div>
        )}
      </Form.List>
    </Form>
  );
};

const MembersStep = ({ form, draft }: { form: FormInstance; draft: Registration }) => {
  const [bulk, setBulk] = useState("");
  const detailed = draft.flow === "detailed";
  const unitOptions = [
    { value: "", label: tr("Ban giám đốc") },
    ...draft.units.map((u) => ({ value: u.key, label: u.name })),
  ];
  const taken = () =>
    new Set<string>([
      draft.owner.username,
      ...((form.getFieldValue("members") ?? []) as { username?: string }[]).map((m) => m?.username ?? ""),
    ]);
  const fillUsername = (index: number) => {
    const m = form.getFieldValue(["members", index]);
    if (m?.full_name && !m.username)
      form.setFieldValue(["members", index, "username"], suggestUsername(m.full_name, taken()));
  };
  const addMany = (add: (v: object) => void) => {
    const names = bulk
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const full_name of names) {
      add({ full_name, username: suggestUsername(full_name, taken()), role: "STAFF", unit: "" });
    }
    setBulk("");
  };

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className="auth-form"
      initialValues={{ members: draft.members.map((m) => ({ ...m, unit: m.unit ?? "" })) }}
    >
      <div className="mb-4 rounded-2xl border border-bamboo-200 bg-bamboo-50/70 px-4 py-3 text-[13px] leading-relaxed text-body">
        {tr("Bạn (")}
        {draft.owner.full_name || tr("chủ sở hữu")}
        {tr(
          ") đã có toàn quyền. Mỗi thành viên nhận một mật khẩu tạm sau khi tạo xong và đặt mật khẩu mới ở lần đăng nhập đầu. Có thể bỏ qua bước này và thêm người sau.",
        )}
      </div>
      <Form.List name="members">
        {(fields, { add, remove }) => (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.key}
                className="rounded-2xl border border-black/[0.06] bg-white/50 px-4 pb-1 pt-3 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                    {tr("Thành viên ")} {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={trf("Bỏ thành viên {0}", [index + 1])}
                    title={tr("Bỏ người này")}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                    onClick={() => remove(field.name)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Form.Item name={[field.name, "full_name"]} label={tr("Họ tên")} rules={req(tr("họ tên"))}>
                    <Input onBlur={() => fillUsername(index)} placeholder={tr("Trần Thị Bình")} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, "username"]}
                    label={tr("Tên đăng nhập")}
                    rules={[
                      ...req(tr("tên đăng nhập")),
                      USERNAME_RULE,
                      {
                        validator: async (_, value) => {
                          const all = (form.getFieldValue("members") ?? []) as { username?: string }[];
                          if (
                            value &&
                            (value === draft.owner.username || all.filter((m) => m?.username === value).length > 1)
                          )
                            throw new Error(tr("Tên đăng nhập bị trùng"));
                        },
                      },
                    ]}
                    normalize={(v: string) => v?.toLowerCase().trim()}
                  >
                    <Input autoComplete="off" placeholder="binh.tran" />
                  </Form.Item>
                  <Form.Item name={[field.name, "role"]} label={tr("Quyền")}>
                    <Select
                      options={ROLES.map((r) => ({
                        value: r.value,
                        label: r.label,
                        title: r.description,
                      }))}
                      optionRender={(o) => (
                        <div className="py-0.5">
                          <div className="font-medium">{o.label}</div>
                          <div className="whitespace-normal text-[12px] text-muted">{o.data.title}</div>
                        </div>
                      )}
                    />
                  </Form.Item>
                  {detailed ? (
                    <Form.Item name={[field.name, "unit"]} label={tr("Phòng ban")}>
                      <Select options={unitOptions} />
                    </Form.Item>
                  ) : (
                    <Form.Item name={[field.name, "title"]} label={tr("Chức vụ")}>
                      <Input placeholder={tr("Kế toán, Bán hàng…")} />
                    </Form.Item>
                  )}
                  <Form.Item
                    name={[field.name, "email"]}
                    label="Email"
                    rules={[{ type: "email", message: tr("Email không hợp lệ") }]}
                  >
                    <Input inputMode="email" placeholder={tr("Không bắt buộc")} />
                  </Form.Item>
                  {detailed ? (
                    <Form.Item name={[field.name, "title"]} label={tr("Chức vụ")}>
                      <Input placeholder={tr("Không bắt buộc")} />
                    </Form.Item>
                  ) : (
                    <Form.Item name={[field.name, "phone"]} label={tr("Điện thoại")} rules={[PHONE_RULE]}>
                      <Input inputMode="tel" placeholder={tr("Không bắt buộc")} />
                    </Form.Item>
                  )}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="auth-pill auth-pill--ghost h-9 px-4 text-[13px]"
                onClick={() => add({ full_name: "", username: "", role: "STAFF", unit: "" })}
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> {tr(" Thêm thành viên")}
              </button>
            </div>
            <div className="space-y-2 pt-3">
              <p className="text-[13px] font-medium text-body">{tr("Thêm nhanh nhiều người")}</p>
              <Input.TextArea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                placeholder={tr("Mỗi dòng một họ tên, ví dụ:\nLê Thu Hà\nĐỗ Văn Nam")}
              />
              <button
                type="button"
                disabled={!bulk.trim()}
                className="auth-pill auth-pill--ghost h-9 px-4 text-[13px]"
                onClick={() => addMany(add)}
              >
                <Users className="h-4 w-4" strokeWidth={1.75} /> {tr(" Thêm vào danh sách")}
              </button>
            </div>
          </div>
        )}
      </Form.List>
    </Form>
  );
};

const ToolsStep = ({
  status,
  draft,
  onChange,
}: {
  status: SetupStatus;
  draft: Registration;
  onChange: (d: Partial<Registration>) => void;
}) => {
  const byCode = useMemo(() => new Map(status.modules.map((m) => [m.code, m])), [status.modules]);
  const selected = new Set(draft.modules);
  const withDeps = (code: string, out = new Set<string>()) => {
    out.add(code);
    for (const d of byCode.get(code)?.depends ?? []) if (!out.has(d)) withDeps(d, out);
    return out;
  };
  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) {
      next.delete(code);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of [...next]) {
          if ((byCode.get(c)?.depends ?? []).some((d) => !next.has(d))) {
            next.delete(c);
            changed = true;
          }
        }
      }
    } else {
      withDeps(code, next);
    }
    onChange({ modules: [...next] });
  };
  const industry = industryOf(draft.company.industry);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {tr("Luôn có sẵn: cơ cấu tổ chức, người dùng, phân quyền, danh mục, thông báo.")}
        </p>
        {industry && (
          <button
            type="button"
            className="auth-pill auth-pill--ghost h-8 px-3 text-[12px]"
            onClick={() => {
              const next = new Set<string>();
              for (const c of industry.modules) if (byCode.has(c)) withDeps(c, next);
              onChange({ modules: [...next] });
            }}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> {tr(" Gợi ý cho ")} {industry.label}
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {status.modules.map((m) => {
          const on = selected.has(m.code);
          const neededBy = [...selected].filter((c) => c !== m.code && withDeps(c).has(m.code));
          return (
            <button
              key={m.code}
              type="button"
              aria-pressed={on}
              className="auth-tile items-start"
              onClick={() => toggle(m.code)}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                  on ? "border-bamboo-600 bg-bamboo-600 text-white" : "border-black/20 dark:border-white/25",
                )}
                aria-hidden
              >
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-[14px] font-semibold text-ink">{m.name}</span>
                <span className="block text-[12.5px] leading-snug text-muted">{m.description}</span>
                {HEAVY_MODULES.has(m.code) && (
                  <span className="block text-[12px] font-medium text-amber-700">{tr("Cần máy chủ nhiều RAM")}</span>
                )}
                {on && neededBy.length > 0 && (
                  <span className="block text-[12px] text-bamboo-700">
                    {tr("Cần cho ")} {neededBy.map((c) => byCode.get(c)?.name).join(", ")}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Summary = ({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) => (
  <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] py-3 last:border-0 dark:border-white/10">
    <div className="min-w-0 space-y-0.5">
      <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted">{label}</div>
      <div className="text-[14px] text-ink">{children}</div>
    </div>
    <button type="button" className="shrink-0 text-[13px] font-medium text-bamboo-700 hover:underline" onClick={onEdit}>
      {tr("Sửa")}
    </button>
  </div>
);

const ReviewStep = ({
  status,
  draft,
  goTo,
  onDone,
  back,
}: {
  status: SetupStatus;
  draft: Registration;
  goTo: (k: StepKey) => void;
  onDone: (r: SetupResult) => void;
  back: ReactNode;
}) => {
  const { modal } = App.useApp();
  const [sign, setSign] = useState(false);
  const [application, setApplication] = useState<Application>();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const names = new Map(status.modules.map((m) => [m.code, m.name]));
  const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
  const unitName = (k?: string | null) => draft.units.find((u) => u.key === k)?.name ?? tr("Ban giám đốc");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const payload = (): Registration => ({
    ...draft,
    members: draft.members.map((m) => ({ ...m, unit: m.unit || null })),
    units: draft.flow === "detailed" ? draft.units : [],
  });
  const createUnsigned = () =>
    run(async () => {
      const a = application ?? (await createApplication(payload()));
      onDone(await finishSetup(a));
    });
  const prepareSigning = () => run(async () => setApplication(await createApplication(payload())));
  const submitSigned = () =>
    run(async () => {
      if (application && file) onDone(await finishSetup(application, await fileToBase64(file)));
    });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-black/[0.06] bg-white/50 px-5 dark:border-white/10 dark:bg-white/[0.03]">
        <Summary label={tr("Chủ sở hữu")} onEdit={() => goTo("profile")}>
          {draft.owner.full_name} · {draft.owner.title} · <span className="font-mono">{draft.owner.username}</span>
        </Summary>
        <Summary label={tr("Doanh nghiệp")} onEdit={() => goTo("company")}>
          {draft.company.legal_name} · MST {draft.company.tax_code}
          {draft.company.industry && ` · ${draft.company.industry}`}
        </Summary>
        <Summary label={tr("Quy mô")} onEdit={() => goTo("size")}>
          {SIZES.find((s) => s.value === draft.size_band)?.label} {tr(" · thiết lập")}{" "}
          {draft.flow === "quick" ? tr("nhanh") : tr("chi tiết")}
        </Summary>
        {draft.flow === "detailed" && (
          <Summary label={trf("Phòng ban ({0})", [draft.units.length])} onEdit={() => goTo("units")}>
            {draft.units.map((u) => u.name).join(", ")}
          </Summary>
        )}
        <Summary label={trf("Thành viên ({0})", [draft.members.length])} onEdit={() => goTo("members")}>
          {draft.members.length === 0
            ? tr("Chưa thêm; thêm sau ở Quản trị → Người dùng")
            : draft.members
                .map(
                  (m) =>
                    `${m.full_name} (${roleLabel(m.role)}${draft.flow === "detailed" ? `, ${unitName(m.unit)}` : ""})`,
                )
                .join(", ")}
        </Summary>
        <Summary label={trf("Công cụ ({0})", [draft.modules.length])} onEdit={() => goTo("tools")}>
          {draft.modules.length === 0 ? tr("Chỉ phần lõi") : draft.modules.map((c) => names.get(c) ?? c).join(", ")}
        </Summary>
      </div>

      <div className="rounded-2xl border border-black/[0.06] bg-white/50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-bamboo-700" strokeWidth={1.75} />
            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-ink">{tr("Xác thực bằng chữ ký số (tùy chọn)")}</div>
              <p className="text-[13px] leading-relaxed text-muted">
                {tr(
                  "Ký đơn đăng ký bằng chữ ký số doanh nghiệp (USB token) để công ty được đánh dấu đã xác thực. Bỏ qua được; ký bổ sung sau ở Quản trị → Thông tin công ty.",
                )}
              </p>
            </div>
          </div>
          <Switch
            checked={sign}
            disabled={busy || !status.signature_ready}
            onChange={(v) => {
              setSign(v);
              setError(undefined);
            }}
            aria-label={tr("Ký số đơn đăng ký ngay")}
          />
        </div>
        {!status.signature_ready && (
          <p className="mt-3 text-[12.5px] text-muted">
            {tr(
              "Máy chủ chưa cài chứng thư gốc để kiểm chữ ký số, nên bước này tạm ẩn. Ký bổ sung sau khi người quản trị máy chủ cài chứng thư Root CA quốc gia.",
            )}
          </p>
        )}
        {sign && (
          <div className="mt-4 space-y-3">
            {!application ? (
              <button type="button" className="auth-pill auth-pill--ghost" disabled={busy} onClick={prepareSigning}>
                <FileSignature className="h-4 w-4" strokeWidth={1.75} /> {tr(" Lập đơn đăng ký để ký")}
              </button>
            ) : (
              <>
                <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-body">
                  <li>
                    <a href={applicationPdfUrl(application)} download className="font-medium text-bamboo-700 underline">
                      {tr("Tải đơn đăng ký (PDF)")}
                    </a>{" "}
                    {tr("· mã đơn ")} <span className="font-mono">{application.nonce}</span>
                    {tr(", hết hạn lúc")} {new Date(application.expires_at).toLocaleTimeString("vi-VN")}
                  </li>
                  <li>{tr("Ký số tệp bằng phần mềm ký của nhà cung cấp hoặc Adobe Acrobat Reader; không sửa tệp.")}</li>
                  <li>{tr("Tải tệp đã ký lên dưới đây.")}</li>
                </ol>
                <Upload.Dragger
                  accept=".pdf,application/pdf"
                  maxCount={1}
                  beforeUpload={(f) => {
                    setFile(f);
                    return false;
                  }}
                  onRemove={() => setFile(undefined)}
                >
                  <p className="py-2 text-[13px]">{tr("Kéo thả hoặc bấm để chọn đơn đã ký (PDF, tối đa 5 MB)")}</p>
                </Upload.Dragger>
              </>
            )}
          </div>
        )}
      </div>

      {error && <Alert type="error" showIcon message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
        {back}
        <div className="flex flex-wrap justify-end gap-2">
          {sign && application ? (
            <>
              {status.allow_unverified && (
                <button type="button" className="auth-pill auth-pill--ghost" disabled={busy} onClick={createUnsigned}>
                  {tr("Tạo, ký sau")}
                </button>
              )}
              <button
                type="button"
                className="auth-pill auth-pill--primary"
                disabled={busy || !file}
                onClick={submitSigned}
              >
                {busy ? <Spin size="small" /> : <Check className="h-4 w-4" strokeWidth={2.25} />}
                {tr("Gửi đơn đã ký và tạo")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="auth-pill auth-pill--primary min-w-[180px]"
              disabled={busy || sign || !status.allow_unverified}
              onClick={() =>
                draft.members.length === 0
                  ? modal.confirm({
                      title: tr("Tạo tài khoản khi chưa có thành viên?"),
                      content: tr("Bạn thêm người sau ở Quản trị → Người dùng, hoặc nhập từ Excel."),
                      okText: tr("Tạo tài khoản"),
                      cancelText: tr("Thêm thành viên"),
                      onOk: createUnsigned,
                      onCancel: () => goTo("members"),
                    })
                  : createUnsigned()
              }
            >
              {busy ? <Spin size="small" /> : <Check className="h-4 w-4" strokeWidth={2.25} />}
              {tr("Tạo tài khoản doanh nghiệp")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const DoneView = ({ result }: { result: SetupResult }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const text = result.accounts.map((a) => `${a.full_name ?? ""}\t${a.role}\t${a.username}\t${a.password}`).join("\n");
  return (
    <div className="auth-card px-6 py-10 sm:px-12">
      <div className="mx-auto max-w-[680px] space-y-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-bamboo-600 text-white shadow-[var(--shadow-glass-active)]">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">
            {tr("Đã tạo ")} {result.tenant_name}
          </h1>
          <p className="text-[15px] text-body">
            {result.legal_status === "VERIFIED"
              ? trf("Đã xác thực pháp lý bằng chữ ký số của {0}.", [result.signer])
              : tr("Công ty chưa xác thực pháp lý; ký số bổ sung bất cứ lúc nào ở Quản trị → Thông tin công ty.")}
          </p>
        </div>
        <Alert
          type="warning"
          showIcon
          message={tr("Mật khẩu tạm chỉ hiện một lần")}
          description={tr(
            "Ghi lại hoặc in danh sách và trao tận tay từng người. Lần đăng nhập đầu, mỗi người đặt mật khẩu mới; chủ sở hữu và quản trị viên cài thêm mã xác thực hai lớp.",
          )}
        />
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white/60 dark:border-white/10 dark:bg-white/[0.03]">
          {result.accounts.map((a) => (
            <div
              key={a.username}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-black/[0.06] px-4 py-3 last:border-0 dark:border-white/10"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink">{a.full_name ?? a.username}</div>
                <div className="text-[12.5px] text-muted">
                  {a.role} · <span className="font-mono">{a.username}</span>
                </div>
              </div>
              <code className="rounded-lg bg-black/[0.04] px-2.5 py-1 font-mono text-[13px] text-ink dark:bg-white/[0.08]">
                {a.password}
              </code>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2 print:hidden">
          <button
            type="button"
            className="auth-pill auth-pill--ghost"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(text)
                .then(() => message.success(tr("Đã sao chép danh sách tài khoản")))
                .catch(() => message.error(tr("Trình duyệt không cho sao chép; hãy in danh sách")))
            }
          >
            <ClipboardCopy className="h-4 w-4" strokeWidth={1.75} /> {tr(" Sao chép")}
          </button>
          <button type="button" className="auth-pill auth-pill--ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" strokeWidth={1.75} /> {tr(" In danh sách")}
          </button>
          <button type="button" className="auth-pill auth-pill--primary" onClick={() => navigate("/login")}>
            {tr("Đăng nhập ")} <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};

const SignupWizard = ({ status, onDone }: { status: SetupStatus; onDone: (r: SetupResult) => void }) => {
  const [draft, setDraft] = useState<Registration>(readDraft);
  const [step, setStep] = useState<StepKey>("profile");
  const [profileForm] = Form.useForm();
  const [companyForm] = Form.useForm();
  const [unitsForm] = Form.useForm();
  const [membersForm] = Form.useForm();
  const typedMembers = Form.useWatch("members", membersForm) as unknown[] | undefined;

  const steps: StepKey[] = [
    "profile",
    "company",
    "size",
    ...(draft.flow === "detailed" ? (["units"] as const) : []),
    "members",
    "tools",
    "review",
  ];
  const index = Math.max(0, steps.indexOf(step));
  const info = STEP_INFO[step];

  const update = (patch: Partial<Registration>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.flow === "quick") next.members = next.members.map((m) => ({ ...m, unit: null }));
      if (patch.company?.industry && d.modules.length === 0) {
        next.modules = (industryOf(patch.company.industry)?.modules ?? []).flatMap((c) => {
          const m = status.modules.find((x) => x.code === c);
          return m ? [...m.depends, c] : [];
        });
        next.modules = [...new Set(next.modules)];
      }
      saveDraft(next);
      return next;
    });

  const capture = (): Partial<Registration> => {
    switch (step) {
      case "profile":
        return { owner: { ...draft.owner, ...profileForm.getFieldsValue() } };
      case "company":
        return { company: { ...draft.company, ...companyForm.getFieldsValue() } };
      case "units":
        return { units: (unitsForm.getFieldValue("units") ?? draft.units).filter(Boolean) };
      case "members":
        return { members: (membersForm.getFieldValue("members") ?? draft.members).filter(Boolean) };
      default:
        return {};
    }
  };
  const validate = async (): Promise<Partial<Registration> | null> => {
    try {
      switch (step) {
        case "profile":
          return { owner: { ...draft.owner, ...(await profileForm.validateFields()) } };
        case "company":
          return { company: { ...draft.company, ...(await companyForm.validateFields()) } };
        case "units": {
          const units = (await unitsForm.validateFields()).units as Registration["units"];
          const keys = new Set(units.map((u) => u.key));
          return {
            units,
            members: draft.members.map((m) => (m.unit && !keys.has(m.unit) ? { ...m, unit: null } : m)),
          };
        }
        case "members":
          return { members: ((await membersForm.validateFields()).members ?? []) as Registration["members"] };
        default:
          return {};
      }
    } catch {
      return null;
    }
  };

  const go = (target: StepKey) => {
    update(capture());
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = async () => {
    const patch = await validate();
    if (!patch) return;
    update(patch);
    setStep(steps[index + 1] ?? step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="auth-card md:grid-cols-[260px_minmax(0,1fr)]">
      <nav
        aria-label={tr("Các bước đăng ký")}
        className="hidden flex-col gap-1 border-r border-white/50 bg-white/25 px-4 py-8 md:flex dark:border-white/[0.06] dark:bg-[rgb(0_0_0_/_0.18)]"
      >
        <p className="px-3 pb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
          {tr("Tạo tài khoản")}
        </p>
        {steps.map((s, i) => {
          const Icon = STEP_INFO[s].icon;
          const done = i < index;
          const current = s === step;
          return (
            <button
              key={s}
              type="button"
              disabled={i > index}
              aria-current={current ? "step" : undefined}
              onClick={() => go(s)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors",
                current
                  ? "bg-white/80 font-semibold text-ink shadow-[var(--shadow-card)] dark:bg-white/10"
                  : done
                    ? "text-body hover:bg-white/50 dark:hover:bg-white/5"
                    : "cursor-default text-muted",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors",
                  current
                    ? "bg-bamboo-600 text-white"
                    : done
                      ? "bg-bamboo-100 text-bamboo-700"
                      : "bg-black/[0.05] text-muted dark:bg-white/[0.06]",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                ) : (
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </span>
              {STEP_INFO[s].title}
            </button>
          );
        })}
      </nav>

      <section className="flex min-h-[560px] flex-col px-6 py-8 sm:px-10">
        <div className="mb-6 md:hidden">
          <div className="mb-2 text-[12px] font-medium text-muted">
            {tr("Bước ")} {index + 1}/{steps.length}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-bamboo-600 transition-[width] duration-500"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <header className="mb-6 space-y-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{info.title}</h1>
          <p className="text-[15px] text-body">{info.subtitle}</p>
        </header>

        <div className="flex-1">
          {step === "profile" && <ProfileStep form={profileForm} draft={draft} />}
          {step === "company" && <CompanyStep form={companyForm} draft={draft} />}
          {step === "size" && <SizeStep draft={draft} onChange={update} />}
          {step === "units" && <UnitsStep form={unitsForm} draft={draft} />}
          {step === "members" && <MembersStep form={membersForm} draft={draft} />}
          {step === "tools" && <ToolsStep status={status} draft={draft} onChange={update} />}
          {step === "review" && (
            <ReviewStep
              status={status}
              draft={draft}
              goTo={go}
              onDone={(r) => {
                saveDraft(null);
                onDone(r);
              }}
              back={
                <button type="button" className="auth-pill auth-pill--ghost" onClick={() => go(steps[index - 1])}>
                  <ArrowLeft className="h-4 w-4" strokeWidth={2} /> {tr(" Quay lại")}
                </button>
              }
            />
          )}
        </div>

        <footer className={cn("mt-8 flex items-center justify-between gap-3", step === "review" && "hidden")}>
          {index > 0 ? (
            <button type="button" className="auth-pill auth-pill--ghost" onClick={() => go(steps[index - 1])}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} /> {tr(" Quay lại")}
            </button>
          ) : (
            <a href="/login" className="text-[13px] text-muted hover:text-ink">
              {tr("Đã có tài khoản? ")}{" "}
              <span className="font-semibold text-ink underline underline-offset-2">{tr("Đăng nhập")}</span>
            </a>
          )}
          {step !== "review" && (
            <button type="button" className="auth-pill auth-pill--primary min-w-[140px]" onClick={() => void next()}>
              {step === "members" && !(typedMembers ?? draft.members).length ? tr("Bỏ qua") : tr("Tiếp tục")}
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};

const Notice = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="auth-card max-w-[560px] gap-4 px-8 py-10 sm:px-12">
    <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
    <div className="space-y-3 text-[15px] leading-relaxed text-body">{children}</div>
  </div>
);

/** Đăng ký sử dụng: tạo tài khoản doanh nghiệp lần đầu trên máy chủ tự cài (ADR #57, ADR #62). */
export const SetupPage = () => {
  const [status, setStatus] = useState<SetupStatus>();
  const [result, setResult] = useState<SetupResult>();

  useEffect(() => {
    void setupStatus().then(setStatus);
  }, []);

  return (
    <AuthShell wide>
      {result ? (
        <DoneView result={result} />
      ) : !status ? (
        <Spin size="large" />
      ) : !status.open ? (
        <Notice title={tr("Hệ thống đã có doanh nghiệp")}>
          <p>
            {tr(
              "Trang đăng ký chỉ dùng một lần khi cài đặt. Đăng nhập bằng tài khoản đã được cấp; công ty thành viên do chủ sở hữu tạo ở Quản trị → Thông tin công ty.",
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <a href="/login" className="auth-pill auth-pill--primary no-underline">
              {tr("Đăng nhập")}
            </a>
            <a href="/khoi-phuc" className="auth-pill auth-pill--ghost no-underline">
              {tr("Khôi phục tài khoản chủ sở hữu")}
            </a>
          </div>
        </Notice>
      ) : !status.window_open ? (
        <Notice title={tr("Đã hết thời gian đăng ký")}>
          <p>
            {tr(
              "Để an toàn, trang đăng ký chỉ mở trong 24 giờ sau khi cài đặt hoặc khởi động lại máy chủ. Người quản trị máy chủ chạy lệnh dưới đây để mở lại thêm 24 giờ, rồi tải lại trang này:",
            )}
          </p>
          <code className="block rounded-xl bg-black/[0.05] px-4 py-3 font-mono text-[13px] text-ink dark:bg-white/[0.08]">
            make setup-code
          </code>
        </Notice>
      ) : (
        <SignupWizard status={status} onDone={setResult} />
      )}
    </AuthShell>
  );
};
