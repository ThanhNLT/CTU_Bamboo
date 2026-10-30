// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { config } from "../../config";

export type SetupStatus = { open: boolean; signature_ready: boolean; allow_unverified: boolean };

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

export type Application = { application_id: string; token: string; nonce: string; expires_at: string };

export type SetupResult = {
  tenant_code: string;
  tenant_name: string;
  legal_status: "VERIFIED" | "UNVERIFIED";
  signer: string | null;
  accounts: { role: string; username: string; password: string }[];
};

const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const resp = await fetch(`${config.setupUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.message ?? `Máy chủ trả lỗi ${resp.status}`);
  return body as T;
};

/** Trang khởi tạo chỉ mở khi máy chủ chưa có công ty nào (ADR #57); không hỏi được thì coi như đóng. */
export const setupStatus = (): Promise<SetupStatus> =>
  call<SetupStatus>("/status").catch(() => ({ open: false, signature_ready: false, allow_unverified: false }));

export const createApplication = (body: {
  setup_code: string;
  company: Company;
  owner: Account;
  admin?: Account | null;
}) => call<Application>("/applications", { method: "POST", body: JSON.stringify(body) });

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
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được tệp"));
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
