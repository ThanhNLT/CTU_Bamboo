/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { App, Input, Segmented, Table, Tag } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { request } from "../../api/client";
import { useSession } from "../../auth/useSession";
import { downloadUrl, fetchLibrary, reindexDocument, retireDocument, searchLibrary } from "./api";
import { DocumentDetail } from "./components/DocumentDetail";
import { DocumentList } from "./components/DocumentList";
import { FilterSection } from "./components/FilterSection";
import { LibraryHeader } from "./components/LibraryHeader";
import { ProposeModal, type ProposalDraft } from "./components/ProposeModal";
import { CATEGORY_SHORT, PROPOSAL_STATUS } from "./labels";
import type { CategoryFilter, DocCategory, LibraryDoc, ScopeFilter } from "./types";
import { filterDocs } from "./utils";
import { tr, trf } from "../../i18n";

type Tab = "library" | "mine";
type Proposal = {
  id: string;
  doc_no: string;
  title: string;
  category: DocCategory;
  status: string;
  updated_at: string;
};

const MINE = `query MyProposals($me: uuid!) {
  collab_kb_document(where: {requester_id: {_eq: $me}}, order_by: {updated_at: desc}, limit: 100) {
    id doc_no title category status updated_at } }`;

export const KnowledgeLibraryPage = () => {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { tenant } = useSession();
  const [params, setParams] = useSearchParams();
  const [library, setLibrary] = useState<{ canPropose: boolean; docs: LibraryDoc[] }>();
  const [mine, setMine] = useState<Proposal[]>([]);
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [proposing, setProposing] = useState<ProposalDraft>();
  const [fullText, setFullText] = useState<Set<string>>();

  const load = useCallback(() => {
    fetchLibrary()
      .then(setLibrary)
      .catch((e: Error) => message.error(e.message));
    request<{ collab_kb_document: Proposal[] }>(MINE, { me: tenant.person_id })
      .then((r) => setMine(r.collab_kb_document))
      .catch(() => setMine([]));
  }, [message, tenant.person_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    setFullText(undefined);
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchLibrary(q)
        .then((ids) => live && setFullText(ids))
        .catch(() => undefined);
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const docs = useMemo(() => library?.docs ?? [], [library]);
  const visible = useMemo(
    () => filterDocs(docs, { query, scope, category }, fullText),
    [docs, query, scope, category, fullText],
  );
  const counts = useMemo(() => {
    const inScope = filterDocs(docs, { query, scope, category: "all" }, fullText);
    const out: Partial<Record<CategoryFilter, number>> = { all: inScope.length };
    inScope.forEach((d) => (out[d.category] = (out[d.category] ?? 0) + 1));
    return out;
  }, [docs, query, scope, fullText]);
  const selectedId = params.get("doc") ?? undefined;
  const selected = visible.find((d) => d.id === selectedId) ?? visible[0];
  const select = (id: string) => setParams({ doc: id }, { replace: true });

  const download = async (attachmentId: string) => {
    try {
      window.open(await downloadUrl(attachmentId), "_blank", "noopener");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const reindex = async (d: LibraryDoc) => {
    try {
      await reindexDocument(d.id);
      message.success(trf("Đã yêu cầu nạp lại chỉ mục cho “{0}”.", [d.title]));
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const retire = (d: LibraryDoc) => {
    let reason = "";
    modal.confirm({
      title: trf("Ngừng hiệu lực “{0}”?", [d.title]),
      content: (
        <Input.TextArea rows={3} placeholder={tr("Lý do (bắt buộc)")} onChange={(e) => (reason = e.target.value)} />
      ),
      okText: tr("Ngừng hiệu lực"),
      okButtonProps: { danger: true },
      cancelText: tr("Không"),
      onOk: async () => {
        if (!reason.trim()) {
          message.error(tr("Phải ghi lý do"));
          throw new Error("missing reason");
        }
        await retireDocument(d.id, reason.trim())
          .then(() => {
            message.success(tr("Đã ngừng hiệu lực tài liệu."));
            load();
          })
          .catch((e: Error) => message.error(e.message));
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <LibraryHeader
        canPropose={library?.canPropose ?? false}
        onSuggest={() => setProposing({})}
        onAskLibrary={() => navigate("/i/assistant?source=library")}
      />

      <Segmented
        className="self-start"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "library", label: trf("Thư viện ({0})", [docs.length]) },
          { value: "mine", label: trf("Đề xuất của tôi ({0})", [mine.length]) },
        ]}
      />

      {tab === "library" ? (
        <>
          <FilterSection
            query={query}
            onQueryChange={setQuery}
            scope={scope}
            onScopeChange={setScope}
            category={category}
            onCategoryChange={setCategory}
            counts={counts}
          />
          <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-340px)] lg:min-h-[460px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <DocumentList
              docs={visible}
              selectedId={selected?.id}
              onSelect={select}
              className="max-h-[420px] lg:max-h-none"
            />
            <DocumentDetail
              doc={selected}
              onAsk={(d) => navigate(`/i/assistant?doc=${encodeURIComponent(d.id)}`)}
              onReindex={(d) => void reindex(d)}
              onDownload={(f) => void download(f.id)}
              onSupersede={
                library?.canPropose
                  ? (d) =>
                      setProposing({
                        title: d.title,
                        category: d.category,
                        scope: d.scope,
                        summary: d.summary,
                        toc: d.toc,
                        supersedes_id: d.id,
                        supersedes_title: d.title,
                      })
                  : undefined
              }
              onRetire={retire}
            />
          </div>
        </>
      ) : (
        <section
          className="rounded-2xl border border-line bg-surface p-3 shadow-card"
          aria-label={tr("Đề xuất của tôi")}
        >
          <Table<Proposal>
            rowKey="id"
            size="middle"
            dataSource={mine}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: tr("Bạn chưa đề xuất tài liệu nào.") }}
            columns={[
              {
                title: tr("Số"),
                dataIndex: "doc_no",
                width: 170,
                render: (v: string, r) => (
                  <Link to={`/h/library/proposals/${r.id}`} className="font-mono text-[12.5px]">
                    {v}
                  </Link>
                ),
              },
              { title: tr("Tài liệu"), dataIndex: "title" },
              { title: tr("Loại"), dataIndex: "category", width: 150, render: (v: DocCategory) => CATEGORY_SHORT[v] },
              {
                title: tr("Trạng thái"),
                dataIndex: "status",
                width: 150,
                render: (v: string) => <Tag color={PROPOSAL_STATUS[v]?.color}>{PROPOSAL_STATUS[v]?.label ?? v}</Tag>,
              },
            ]}
          />
        </section>
      )}

      <ProposeModal
        open={proposing !== undefined}
        draft={proposing}
        onClose={() => setProposing(undefined)}
        onSaved={(id) => {
          setProposing(undefined);
          message.success(tr("Đã lưu nháp. Đính kèm tệp rồi gửi duyệt."));
          navigate(`/h/library/proposals/${id}`);
        }}
      />
    </div>
  );
};

export default KnowledgeLibraryPage;
