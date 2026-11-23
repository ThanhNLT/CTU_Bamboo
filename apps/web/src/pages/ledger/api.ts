/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { request } from "../../api/client";
import type { AccessLog, ArchiveDoc, ArchiveView, LedgerOverview, Seal, VerifyResult } from "./types";

const SEAL = `attachment_id entity_type entity_id code version title file_name unit sealed_at channel block tx_id
  sha256 last_result last_checked_at`;

const OVERVIEW = `query LedgerOverview($limit: Int) { ledger_overview(limit: $limit) {
  channel sealed sealed_this_week archived checked_today matched_today mismatched_today mismatch_30d chain_reader
  recent { ${SEAL} } } }`;

const VERIFY = `mutation LedgerVerify($code: String, $sha256: String, $file_name: String) {
  ledger_verify(code: $code, sha256: $sha256, file_name: $file_name) {
    kind via query file_name checked_at actual_sha256 problem seal { ${SEAL} } } }`;

const ARCHIVE = `query LedgerArchive { ledger_archive {
  docs { attachment_id code title file_name content_type size_bytes unit restricted archived_year }
  access { id doc_title file_name viewer opened_at } } }`;

const OPEN = `mutation LedgerOpen($id: uuid!) { ledger_open_archive(attachment_id: $id) {
  attachment_id title file_name content_type viewer opened_at url } }`;

type SealRow = {
  attachment_id: string;
  entity_type: string;
  entity_id: string;
  code: string;
  version: number;
  title: string;
  file_name: string;
  unit: string;
  sealed_at: string;
  channel: string;
  block: number | null;
  tx_id: string | null;
  sha256: string;
  last_result: Seal["lastResult"];
  last_checked_at: string | null;
};

const toSeal = (r: SealRow): Seal => ({
  attachmentId: r.attachment_id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  code: r.code,
  version: r.version,
  title: r.title,
  fileName: r.file_name,
  unit: r.unit,
  sealedAt: r.sealed_at,
  channel: r.channel,
  block: r.block,
  txId: r.tx_id,
  sha256: r.sha256,
  lastResult: r.last_result,
  lastCheckedAt: r.last_checked_at,
});

export const fetchOverview = async (limit = 20): Promise<LedgerOverview> => {
  const { ledger_overview: o } = await request<{
    ledger_overview: {
      channel: string;
      sealed: number;
      sealed_this_week: number;
      archived: number;
      checked_today: number;
      matched_today: number;
      mismatched_today: number;
      mismatch_30d: number;
      chain_reader: boolean;
      recent: SealRow[];
    };
  }>(OVERVIEW, { limit });
  return {
    channel: o.channel,
    sealed: o.sealed,
    sealedThisWeek: o.sealed_this_week,
    archived: o.archived,
    checkedToday: o.checked_today,
    matchedToday: o.matched_today,
    mismatchedToday: o.mismatched_today,
    mismatch30d: o.mismatch_30d,
    chainReader: o.chain_reader,
    recent: o.recent.map(toSeal),
  };
};

export const verify = async (input: { code: string } | { sha256: string; fileName: string }): Promise<VerifyResult> => {
  const { ledger_verify: r } = await request<{
    ledger_verify: {
      kind: VerifyResult["kind"];
      via: "code" | "file";
      query: string;
      file_name: string | null;
      checked_at: string;
      actual_sha256: string | null;
      problem: string | null;
      seal: SealRow | null;
    };
  }>(VERIFY, "code" in input ? { code: input.code } : { sha256: input.sha256, file_name: input.fileName });
  const base = { via: r.via, checkedAt: r.checked_at, fileName: r.file_name ?? undefined };
  if (r.kind === "not_found" || !r.seal) {
    return { kind: "not_found", query: r.query, sha256: "sha256" in input ? input.sha256 : undefined, ...base };
  }
  const seal = toSeal(r.seal);
  return r.kind === "match"
    ? { kind: "match", seal, ...base }
    : { kind: "mismatch", seal, actualSha256: r.actual_sha256, problem: r.problem ?? undefined, ...base };
};

export const fetchArchive = async (): Promise<{ docs: ArchiveDoc[]; access: AccessLog[] }> => {
  const { ledger_archive: a } = await request<{
    ledger_archive: {
      docs: {
        attachment_id: string;
        code: string;
        title: string;
        file_name: string;
        content_type: string;
        size_bytes: number;
        unit: string;
        restricted: boolean;
        archived_year: number;
      }[];
      access: { id: string; doc_title: string; file_name: string; viewer: string; opened_at: string }[];
    };
  }>(ARCHIVE);
  return {
    docs: a.docs.map((d) => ({
      id: d.attachment_id,
      code: d.code,
      title: d.title,
      fileName: d.file_name,
      contentType: d.content_type,
      sizeBytes: d.size_bytes,
      unit: d.unit,
      restricted: d.restricted,
      archivedYear: d.archived_year,
    })),
    access: a.access.map((l) => ({
      id: l.id,
      docTitle: l.doc_title,
      fileName: l.file_name,
      viewer: l.viewer,
      at: l.opened_at,
    })),
  };
};

export const openArchive = async (attachmentId: string): Promise<ArchiveView> => {
  const { ledger_open_archive: v } = await request<{
    ledger_open_archive: {
      attachment_id: string;
      title: string;
      file_name: string;
      content_type: string;
      viewer: string;
      opened_at: string;
      url: string;
    };
  }>(OPEN, { id: attachmentId });
  return {
    attachmentId: v.attachment_id,
    title: v.title,
    fileName: v.file_name,
    contentType: v.content_type,
    viewer: v.viewer,
    openedAt: v.opened_at,
    url: v.url,
  };
};
