import { DatabaseZap, Lock } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { DataFilterBar } from "./components/DataFilterBar";
import { DatasetDetailPanel } from "./components/DatasetDetailPanel";
import { DatasetList } from "./components/DatasetList";
import type { DomainFilter } from "./types";
import { useLakehouseDatasets } from "./useLakehouse";
import { domainCounts, filterDatasets } from "./utils";
import { tr } from "../../i18n";

const Notice = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <div
    role="status"
    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center"
  >
    {icon}
    <p className="text-[14px] font-medium text-ink">{title}</p>
    <p className="max-w-[520px] text-[12.5px] text-muted">{children}</p>
  </div>
);

export const DataServicesPage = () => {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [params] = useSearchParams();
  const { datasets, loading, error } = useLakehouseDatasets();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("dataset"));

  const domains = useMemo(() => domainCounts(datasets), [datasets]);
  const visible = useMemo(() => filterDatasets(datasets, query, domain), [datasets, query, domain]);
  const selected = visible.find((d) => d.id === selectedId) ?? visible[0];

  let body: ReactNode;
  if (loading) {
    body = <p className="text-[13px] text-muted">{tr("Đang tải danh mục tập dữ liệu…")}</p>;
  } else if (error?.statusCode === 403) {
    body = (
      <Notice
        icon={<Lock className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />}
        title={tr("Bạn chưa có quyền xem dữ liệu Lakehouse")}
      >
        {tr("Cần quyền ")} <span className="font-mono">data.lakehouse.read</span>{" "}
        {tr(
          " (vai trò Phân tích dữ liệu). Liên hệ quản trị tổ chức của công ty để được cấp; quyền được cấp ghi nhật ký kiểm toán.",
        )}
      </Notice>
    );
  } else if (error) {
    body = (
      <Notice
        icon={<DatabaseZap className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />}
        title={tr("Không tải được danh mục")}
      >
        {error.message}
      </Notice>
    );
  } else {
    body = (
      <>
        <DataFilterBar
          query={query}
          onQueryChange={setQuery}
          domain={domain}
          onDomainChange={setDomain}
          domains={domains}
          total={datasets.length}
        />
        <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-250px)] lg:min-h-[480px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <DatasetList
            className="max-h-[520px] lg:max-h-none"
            datasets={visible}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
          <DatasetDetailPanel key={selected?.id ?? "none"} dataset={selected} />
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Dịch vụ dữ liệu")}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {tr("Tập dữ liệu Lakehouse của công ty đang chọn · tìm, hiểu và dùng lại thay vì xin dữ liệu thô")}
        </p>
      </div>
      {body}
    </div>
  );
};

export default DataServicesPage;
