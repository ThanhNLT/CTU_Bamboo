import { config } from "../../config";
import { localizeModule } from "../../modules/api";
import { tr, trf } from "../../i18n";

export type ModuleInfo = { code: string; name: string; description: string; depends: string[] };

export type SetupStatus = {
  /** Máy chủ chưa có công ty nào */
  empty: boolean;
  /** Nhận đăng ký: máy trống, hoặc máy chủ mở đăng ký cả khi đã có công ty (SETUP_OPEN_SIGNUP, bản demo) */
  open: boolean;
  /** Còn trong 24 giờ sau khi cài: đăng ký không cần mã thiết lập (ADR #62) */
  window_open: boolean;
  signature_ready: boolean;
  allow_unverified: boolean;
  modules: ModuleInfo[];
};

export type SizeBand = "1-10" | "11-50" | "51-200" | "200+";
export type MemberRole = "STAFF" | "MANAGER" | "ACCOUNTANT" | "ADMIN";

export type Registration = {
  owner: {
    full_name: string;
    birth_year?: number | null;
    title?: string;
    phone?: string;
    email?: string;
    username: string;
  };
  company: { legal_name: string; tax_code: string; code?: string; address?: string; industry?: string };
  size_band: SizeBand;
  flow: "quick" | "detailed";
  units: { key: string; name: string; type: string }[];
  members: {
    full_name: string;
    username: string;
    email?: string;
    phone?: string;
    title?: string;
    role: MemberRole;
    unit?: string | null;
  }[];
  modules: string[];
};

export type Company = {
  code: string;
  tax_code: string;
  legal_name: string;
  short_name?: string;
  address: string;
  legal_rep_name: string;
  legal_rep_title?: string;
};

export type Account = { username: string; email?: string; full_name?: string };

export type Application = {
  application_id: string;
  token: string;
  nonce: string;
  expires_at: string;
  tenant_code?: string;
};

export type SetupResult = {
  tenant_code: string;
  tenant_name: string;
  legal_status: "VERIFIED" | "UNVERIFIED";
  signer: string | null;
  modules?: string[];
  accounts: { role: string; full_name?: string; username: string; password: string }[];
};

const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const resp = await fetch(`${config.setupUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.message ?? trf("Máy chủ trả lỗi {0}", [resp.status]));
  return body as T;
};

const CLOSED: SetupStatus = {
  empty: false,
  open: false,
  window_open: false,
  signature_ready: false,
  allow_unverified: false,
  modules: [],
};

/** Trang đăng ký mở khi máy chủ chưa có công ty nào (ADR #57) hoặc bật SETUP_OPEN_SIGNUP; không hỏi được thì coi như đóng. */
export const setupStatus = (): Promise<SetupStatus> =>
  call<SetupStatus>("/status")
    .then((s) => ({ ...CLOSED, ...s, modules: (s.modules ?? []).map(localizeModule) }))
    .catch(() => CLOSED);

/** Gửi toàn bộ dữ liệu trình hướng dẫn đăng ký (ADR #62); trả đơn để tùy chọn ký số trước khi tạo công ty. */
export const createApplication = (body: Registration) =>
  call<Application>("/applications", { method: "POST", body: JSON.stringify(body) });

export const applicationPdfUrl = (a: Application) =>
  `${config.setupUrl}/applications/${a.application_id}/pdf?token=${encodeURIComponent(a.token)}`;

export const finishSetup = (a: Application, signedPdfBase64?: string) =>
  call<SetupResult>(`/applications/${a.application_id}/finish`, {
    method: "POST",
    body: JSON.stringify({ token: a.token, signed_pdf_base64: signedPdfBase64 }),
  });

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error(tr("Không đọc được tệp")));
    reader.readAsDataURL(file);
  });

export type Recovery = {
  application_id: string;
  token: string;
  nonce: string;
  expires_at: string;
  tenant_name: string;
};

export const startRecovery = (taxCode: string) =>
  call<Recovery>("/recovery", { method: "POST", body: JSON.stringify({ tax_code: taxCode }) });

export const recoveryPdfUrl = (r: Recovery) =>
  `${config.setupUrl}/applications/${r.application_id}/pdf?token=${encodeURIComponent(r.token)}`;

export const finishRecovery = (r: Recovery, signedPdfBase64: string) =>
  call<{ tenant_name: string; username: string; password: string }>(`/recovery/${r.application_id}/finish`, {
    method: "POST",
    body: JSON.stringify({ token: r.token, signed_pdf_base64: signedPdfBase64 }),
  });
