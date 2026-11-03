// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../../../api/client";
import { tr } from "../../../i18n";

export type AdminEntity =
  | "org_unit"
  | "position"
  | "person"
  | "assignment"
  | "role"
  | "role_grant"
  | "catalog_item"
  | "partner"
  | "item"
  | "storage_quota";

export const adminSave = async (entity: AdminEntity, data: Record<string, unknown>): Promise<string> => {
  const r = await request<{ admin_save: { id: string } }>(
    `mutation AdminSave($e: AdminEntity!, $d: jsonb!) { admin_save(entity: $e, data: $d) { id } }`,
    { e: entity, d: data },
  );
  return r.admin_save.id;
};

export const adminClose = async (entity: AdminEntity, id: string, endDate?: string | null) => {
  await request(
    `mutation AdminClose($e: AdminEntity!, $id: uuid!, $d: date) { admin_close(entity: $e, id: $id, end_date: $d) { id } }`,
    { e: entity, id, d: endDate ?? null },
  );
};

export type DeletedAccount = "none" | "kept" | "disabled";

export const deletePerson = async (id: string): Promise<DeletedAccount> => {
  const r = await request<{ delete_person: { account: DeletedAccount } }>(
    `mutation DeletePerson($id: uuid!) { delete_person(id: $id) { account } }`,
    { id },
  );
  return r.delete_person.account;
};

export type AccountInput = { person_id: string; username: string; email?: string | null; link_existing?: boolean };
export type AccountResult = {
  person_id: string;
  username: string;
  temporary_password: string | null;
  error: string | null;
};

export const createAccounts = async (accounts: AccountInput[]): Promise<AccountResult[]> => {
  const r = await request<{ create_person_accounts: AccountResult[] }>(
    `mutation Accounts($a: [AdminAccountInput!]!) {
       create_person_accounts(accounts: $a) { person_id username temporary_password error } }`,
    { a: accounts },
  );
  return r.create_person_accounts;
};

export type ImportKind = Exclude<AdminEntity, "assignment" | "role" | "storage_quota">;
export type ImportResult = {
  total: number;
  valid: number;
  applied: boolean;
  dry_run: boolean;
  errors: { row: number; message: string }[];
  created: { row: number; person_id: string; full_name: string; username: string; email: string | null }[];
};

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error(tr("Không đọc được tệp")));
    reader.readAsDataURL(file);
  });

export const importFile = async (kind: ImportKind, file: File, dryRun: boolean): Promise<ImportResult> => {
  const r = await request<{ admin_import: ImportResult }>(
    `mutation Import($k: AdminEntity!, $n: String!, $c: String!, $d: Boolean!) {
       admin_import(kind: $k, file_name: $n, content_base64: $c, dry_run: $d) {
         total valid applied dry_run errors { row message } created { row person_id full_name username email } } }`,
    { k: kind, n: file.name, c: await toBase64(file), d: dryRun },
  );
  return r.admin_import;
};

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadTemplate = async (kind: ImportKind) => {
  const r = await request<{ admin_import_template: { file_name: string; content_base64: string } }>(
    `query Template($k: AdminEntity!) { admin_import_template(kind: $k) { file_name content_base64 } }`,
    { k: kind },
  );
  const bytes = Uint8Array.from(atob(r.admin_import_template.content_base64), (c) => c.charCodeAt(0));
  saveBlob(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    r.admin_import_template.file_name,
  );
};

export const downloadCsv = (fileName: string, rows: string[][]) => {
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  saveBlob(
    new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }),
    fileName,
  );
};
