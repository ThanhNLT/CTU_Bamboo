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
import type { DocCategory, DocScope, IndexState, LibraryDoc, LibraryFile } from "./types";
import { tr } from "../../i18n";

type Row = {
  id: string;
  doc_no: string;
  title: string;
  category: DocCategory;
  scope: DocScope;
  summary: string | null;
  toc: string[];
  version: number;
  effective_date: string | null;
  published_at: string | null;
  unit: string;
  issuer: string;
  requester: string;
  my_company: boolean | null;
  index_status: "indexed" | "indexing" | "missing" | "error";
  indexed_at: string | null;
  index_error: string | null;
  can_manage: boolean;
  files: LibraryFile[];
  previous: LibraryDoc["previous"];
};

export type ProposalInput = {
  title: string;
  category: DocCategory;
  scope: DocScope;
  summary?: string | null;
  toc: string[];
  effective_date?: string | null;
  supersedes_id?: string | null;
  requester_position_id: string;
};

const toIndex = (r: Row): IndexState =>
  r.index_status === "indexed"
    ? { status: "indexed", at: r.indexed_at }
    : r.index_status === "error"
      ? { status: "error", reason: r.index_error ?? tr("Lỗi không rõ") }
      : { status: r.index_status };

export const fetchLibrary = async (): Promise<{ canPropose: boolean; docs: LibraryDoc[] }> => {
  const { kb_library: r } = await request<{ kb_library: { can_propose: boolean; documents: Row[] } }>(
    `query { kb_library { can_propose documents { id doc_no title category scope summary toc version effective_date
      published_at unit issuer requester my_company index_status indexed_at index_error can_manage files previous } } }`,
  );
  return {
    canPropose: r.can_propose,
    docs: r.documents.map((d) => ({
      id: d.id,
      code: d.doc_no,
      title: d.title,
      category: d.category,
      scope: d.scope,
      issuer: d.issuer,
      unit: d.unit,
      requester: d.requester,
      version: d.version,
      summary: d.summary,
      toc: d.toc,
      effectiveDate: d.effective_date,
      publishedAt: d.published_at,
      myCompany: Boolean(d.my_company),
      canManage: d.can_manage,
      index: toIndex(d),
      files: d.files,
      previous: d.previous,
    })),
  };
};

export const createProposal = async (input: ProposalInput): Promise<string> => {
  const r = await request<{ insert_collab_kb_document_one: { id: string } }>(
    `mutation Propose($o: collab_kb_document_insert_input!) { insert_collab_kb_document_one(object: $o) { id } }`,
    { o: input },
  );
  return r.insert_collab_kb_document_one.id;
};

export const updateProposal = async (id: string, input: Omit<ProposalInput, "requester_position_id">) => {
  await request(
    `mutation Update($id: uuid!, $s: collab_kb_document_set_input!) {
      update_collab_kb_document_by_pk(pk_columns: {id: $id}, _set: $s) { id } }`,
    { id, s: input },
  );
};

const action = async (name: string, vars: Record<string, unknown>, args: string) => {
  const r = await request<Record<string, { status: string }>>(
    `mutation ${name}(${args}) { ${name}(${Object.keys(vars)
      .map((k) => `${k}: $${k}`)
      .join(", ")}) { status } }`,
    vars,
  );
  return r[name].status;
};

export const submitProposal = (id: string) => action("submit_kb_document", { id }, "$id: uuid!");
export const cancelProposal = (id: string, reason: string) =>
  action("cancel_kb_document", { id, reason }, "$id: uuid!, $reason: String!");
export const retireDocument = (id: string, reason: string) =>
  action("retire_kb_document", { id, reason }, "$id: uuid!, $reason: String!");
export const reindexDocument = (id: string) => action("kb_reindex", { id }, "$id: uuid!");

export const searchLibrary = async (q: string): Promise<Set<string>> => {
  const r = await request<{ search_documents: { entity_type: string; entity_id: string }[] }>(
    `query KbSearch($q: String!) { search_documents(query: $q, limit: 50) { entity_type entity_id } }`,
    { q },
  );
  return new Set(r.search_documents.filter((h) => h.entity_type === "collab.kb_document").map((h) => h.entity_id));
};

export const downloadUrl = async (attachmentId: string) => {
  const r = await request<{ get_download_url: { url: string } }>(
    `query Dl($a: uuid!) { get_download_url(attachment_id: $a) { url } }`,
    { a: attachmentId },
  );
  return r.get_download_url.url;
};
