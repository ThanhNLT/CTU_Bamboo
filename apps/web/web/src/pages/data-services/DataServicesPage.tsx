// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Dịch vụ dữ liệu (Dữ liệu số): danh mục DaaS dạng master–detail. Trái ~40% danh sách thẻ, phải ~60% chi tiết;
// trên màn hình lớn hai cột cao bằng nhau và cuộn độc lập. Dữ liệu minh họa ở ./mock.
import { App } from "antd";
import { useMemo, useState } from "react";
import { primaryButtonClass } from "../../components/ui";
import { DataFilterBar } from "./components/DataFilterBar";
import { DatasetDetailPanel } from "./components/DatasetDetailPanel";
import { DatasetList } from "./components/DatasetList";
import { RequestAccessModal } from "./components/RequestAccessModal";
import { MOCK_DATASETS } from "./mock";
import type { DomainFilter } from "./types";
import { filterDatasets } from "./utils";

export const DataServicesPage = () => {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(MOCK_DATASETS[0]?.id);
  const [requesting, setRequesting] = useState(false);

  const visible = useMemo(() => filterDatasets(MOCK_DATASETS, query, domain), [query, domain]);
  // Tập đang chọn bị lọc mất thì chọn tập đầu tiên còn hiển thị.
  const selected = visible.find((d) => d.id === selectedId) ?? visible[0];

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">Dịch vụ dữ liệu</h1>
          <p className="mt-1 text-[13px] text-muted">
            Danh mục tập dữ liệu dùng chung (DaaS) · tìm, hiểu và dùng lại thay vì xin dữ liệu thô
          </p>
        </div>
        <button type="button" onClick={() => setRequesting(true)} className={primaryButtonClass}>
          Yêu cầu quyền truy cập
        </button>
      </div>

      <DataFilterBar query={query} onQueryChange={setQuery} domain={domain} onDomainChange={setDomain} />

      {/* Key theo tập đang chọn: đổi tập thì khung chi tiết quay về tab "Lược đồ". */}
      <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-250px)] lg:min-h-[480px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <DatasetList
          className="max-h-[520px] lg:max-h-none"
          datasets={visible}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
        <DatasetDetailPanel key={selected?.id ?? "none"} dataset={selected} />
      </div>

      <RequestAccessModal
        open={requesting}
        datasets={MOCK_DATASETS}
        defaultId={selected?.id}
        onCancel={() => setRequesting(false)}
        onSubmit={(v) => {
          const ds = MOCK_DATASETS.find((d) => d.id === v.datasetId);
          setRequesting(false);
          message.success(`Đã gửi yêu cầu truy cập “${ds?.title ?? v.datasetId}” — chờ ${ds?.owner ?? "chủ sở hữu"} duyệt.`);
        }}
      />
    </div>
  );
};

export default DataServicesPage;
