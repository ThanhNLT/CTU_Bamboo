// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Thư viện tri thức (Con người số): master–detail. Trái 40% danh sách, phải 60% chi tiết; trên màn hình
// lớn hai cột cao bằng nhau và cuộn độc lập. Dữ liệu minh họa ở ./mock.
import { App } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { DocumentDetail } from "./components/DocumentDetail";
import { DocumentList } from "./components/DocumentList";
import { FilterSection } from "./components/FilterSection";
import { LibraryHeader } from "./components/LibraryHeader";
import { MOCK_DOCS } from "./mock";
import type { CategoryFilter, LibraryDoc, ScopeFilter } from "./types";
import { filterDocs } from "./utils";

export const KnowledgeLibraryPage = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [docs, setDocs] = useState<LibraryDoc[]>(MOCK_DOCS);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(MOCK_DOCS[0]?.id);

  const visible = useMemo(() => filterDocs(docs, { query, scope, category }), [docs, query, scope, category]);
  // Tài liệu đang chọn bị lọc mất thì chọn mục đầu tiên còn hiển thị.
  const selected = visible.find((d) => d.id === selectedId) ?? visible[0];

  const reindex = (doc: LibraryDoc) => {
    setDocs((prev) => prev.map((d): LibraryDoc => (d.id === doc.id ? { ...d, index: { status: "indexing", progress: 0 } } : d)));
    message.info(`Đã gửi yêu cầu nạp lại “${doc.title}”.`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <LibraryHeader
        onSuggest={() => message.info("Biểu mẫu đề xuất tài liệu sẽ mở khi có API.")}
        onAskLibrary={() => navigate("/i/assistant?source=library")}
      />

      <FilterSection
        query={query}
        onQueryChange={setQuery}
        scope={scope}
        onScopeChange={setScope}
        category={category}
        onCategoryChange={setCategory}
      />

      <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-300px)] lg:min-h-[460px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <DocumentList
          docs={visible}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          className="max-h-[420px] lg:max-h-none"
        />
        <DocumentDetail
          doc={selected}
          onAsk={(d) => navigate(`/i/assistant?doc=${encodeURIComponent(d.id)}`)}
          onReindex={reindex}
          onHistory={(d) => message.info(`Lịch sử phiên bản của “${d.title}” sẽ có khi nối API.`)}
          onOpenFull={(d) => message.info(`Mở toàn văn “${d.title}” (${d.format}) — cần API tệp.`)}
        />
      </div>
    </div>
  );
};

export default KnowledgeLibraryPage;
