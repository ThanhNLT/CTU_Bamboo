/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import type { HttpError } from "@refinedev/core";
import { App, Input, Popover, Switch } from "antd";
import { ChartNoAxesCombined, Code, DatabaseZap, Download, Lock, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Panel } from "../../components/ui";
import { smallPrimaryButtonClass, smallSecondaryButtonClass } from "../../components/ui/buttons";
import { deleteChart, fetchCatalog, fetchCharts, runQuery, saveChart } from "./api";
import { download, fileName, pivot, sourceOf, suggestName, toCsv } from "./chart";
import { ChartBuilder } from "./components/ChartBuilder";
import { ChartCanvas } from "./components/ChartCanvas";
import { SavedCharts } from "./components/SavedCharts";
import type { Catalog, ChartSpec, ChartType, QueryResult, SavedChart } from "./types";
import { tr, trf } from "../../i18n";

const Notice = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <div
    role="status"
    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center"
  >
    {icon}
    <p className="text-[14px] font-medium text-ink">{title}</p>
    <div className="max-w-[520px] text-[12.5px] text-muted">{children}</div>
  </div>
);

const defaultSpec = (catalog: Catalog): ChartSpec => {
  const source = catalog.sources[0];
  return {
    source: source?.name ?? "",
    metrics: source?.measures[0] ? [source.measures[0].name] : [],
    dimensions: [],
    time_grain: catalog.grains.find((g) => g.name === "month")?.name ?? null,
    filters: [],
  };
};

/** Giá trị đã gặp của từng chiều trong kết quả, để gợi ý bộ lọc. */
const seenValues = (result: QueryResult | null) => {
  const out: Record<string, string[]> = {};
  if (!result) return out;
  result.columns.forEach((c, i) => {
    if (c === "period" || c === "value" || result.measures.some((m) => m.name === c)) return;
    out[c] = [
      ...new Set(
        result.rows
          .map((r) => r[i])
          .filter((v) => v != null)
          .map(String),
      ),
    ].slice(0, 50);
  });
  return out;
};

export const BiAnalyticsPage = () => {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<HttpError | null>(null);
  const [charts, setCharts] = useState<SavedChart[]>([]);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [active, setActive] = useState<SavedChart | null>(null);
  const [result, setResult] = useState<{ data: QueryResult; spec: ChartSpec } | null>(null);
  const [running, setRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const run = useCallback(async (s: ChartSpec) => {
    setRunning(true);
    setQueryError(null);
    try {
      setResult({ data: await runQuery(s), spec: s });
    } catch (e) {
      setQueryError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  const open = useCallback(
    (c: SavedChart) => {
      setActive(c);
      setSpec(c.spec);
      setChartType(c.chart_type);
      setName(c.name);
      setShared(c.shared);
      setParams({ chart: c.id }, { replace: true });
      void run(c.spec);
    },
    [run, setParams],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [cat, saved] = await Promise.all([fetchCatalog(), fetchCharts()]);
        if (!alive) return;
        setCatalog(cat);
        setCharts(saved);
        const wanted = saved.find((c) => c.id === params.get("chart"));
        if (wanted) open(wanted);
        else setSpec(defaultSpec(cat));
      } catch (e) {
        if (alive) setLoadError(e as HttpError);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chart = useMemo(() => (result && catalog ? pivot(result.data, result.spec, catalog) : null), [result, catalog]);
  const values = useMemo(() => seenValues(result?.data ?? null), [result]);
  const source = sourceOf(catalog, result?.data.source);
  const labelOf = (c: string) =>
    c === "period" ? tr("Kỳ") : (source?.dimensions.find((d) => d.name === c)?.label ?? c);
  const title = name.trim() || (spec && catalog ? suggestName(spec, catalog) : "");

  const reset = () => {
    if (!catalog) return;
    setActive(null);
    setName("");
    setShared(false);
    setResult(null);
    setSpec(defaultSpec(catalog));
    setParams({}, { replace: true });
  };

  const save = async (asCopy = false) => {
    if (!spec) return;
    setSaving(true);
    try {
      const input = { name: title.slice(0, 120), chart_type: chartType, spec, shared };
      const saved = await saveChart(input, active?.is_mine && !asCopy ? active.id : undefined);
      setActive(saved);
      setName(saved.name);
      setCharts((cs) => [saved, ...cs.filter((c) => c.id !== saved.id)]);
      setParams({ chart: saved.id }, { replace: true });
      message.success(saved.shared ? tr("Đã lưu và chia sẻ trong công ty.") : tr("Đã lưu biểu đồ."));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (c: SavedChart) =>
    modal.confirm({
      title: trf("Xóa biểu đồ “{0}”?", [c.name]),
      content: c.shared ? tr("Người được chia sẻ cũng không mở được biểu đồ này nữa.") : undefined,
      okText: tr("Xóa"),
      okButtonProps: { danger: true },
      cancelText: tr("Hủy"),
      onOk: async () => {
        try {
          await deleteChart(c.id);
          setCharts((cs) => cs.filter((x) => x.id !== c.id));
          if (active?.id === c.id) reset();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  let body: ReactNode;
  if (loadError?.statusCode === 403) {
    body = (
      <Notice
        icon={<Lock className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />}
        title={tr("Bạn chưa có quyền phân tích dữ liệu")}
      >
        {tr("Cần quyền ")} <span className="font-mono">data.lakehouse.read</span>
        {tr(" (vai trò Phân tích dữ liệu). Liên hệ quản trị tổ chức của công ty để được cấp.")}
      </Notice>
    );
  } else if (loadError) {
    body = (
      <Notice
        icon={<DatabaseZap className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />}
        title={tr("Không tải được danh mục chỉ số")}
      >
        {loadError.message}
      </Notice>
    );
  } else if (!catalog || !spec) {
    body = <p className="text-[13px] text-muted">{tr("Đang tải danh mục chỉ số…")}</p>;
  } else {
    const readOnly = active != null && !active.is_mine;
    body = (
      <>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Panel title={tr("Dựng biểu đồ")} className="lg:sticky lg:top-4">
            <ChartBuilder
              catalog={catalog}
              spec={spec}
              onChange={setSpec}
              chartType={chartType}
              onChartType={setChartType}
              values={values}
              onRun={() => void run(spec)}
              running={running}
            />
          </Panel>

          <Panel
            title={
              <Input
                variant="borderless"
                value={name}
                placeholder={title || tr("Biểu đồ chưa đặt tên")}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                aria-label={tr("Tên biểu đồ")}
                className="!px-0 !text-[16px] !font-semibold"
              />
            }
            extra={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!readOnly && (
                  <label className="flex items-center gap-1.5 text-[12px] text-body">
                    <Switch size="small" checked={shared} onChange={setShared} />
                    {tr("Chia sẻ trong công ty")}
                  </label>
                )}
                {result && (
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    content={
                      <pre className="m-0 max-w-[480px] whitespace-pre-wrap break-words font-mono text-[11.5px] text-body">
                        {result.data.sql}
                      </pre>
                    }
                  >
                    <button type="button" className={smallSecondaryButtonClass} aria-label={tr("Xem câu truy vấn")}>
                      <Code className="h-3.5 w-3.5" aria-hidden />
                      SQL
                    </button>
                  </Popover>
                )}
                {result && (
                  <button
                    type="button"
                    className={smallSecondaryButtonClass}
                    onClick={() => download(fileName(title, "csv"), toCsv(result.data, catalog))}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    CSV
                  </button>
                )}
                <button
                  type="button"
                  className={smallPrimaryButtonClass}
                  disabled={saving || !spec.metrics.length}
                  onClick={() => void save(readOnly)}
                >
                  <Save className="h-3.5 w-3.5" aria-hidden />
                  {readOnly ? tr("Lưu bản của tôi") : active ? tr("Lưu thay đổi") : tr("Lưu")}
                </button>
              </div>
            }
          >
            {queryError ? (
              <Notice
                icon={<DatabaseZap className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />}
                title={tr("Truy vấn không thành công")}
              >
                {queryError}
              </Notice>
            ) : running && !result ? (
              <p className="grid h-[380px] place-items-center text-[13px] text-muted">
                {tr("Đang truy vấn Lakehouse… lần đầu sau khi nhàn rỗi có thể mất khoảng nửa phút.")}
              </p>
            ) : result && chart ? (
              <div className={running ? "opacity-60 transition-opacity" : undefined} aria-busy={running}>
                <ChartCanvas type={chartType} pivot={chart} result={result.data} spec={result.spec} labelOf={labelOf} />
                <p className="mt-2 text-[11.5px] text-muted">
                  {trf("{0} dòng · nguồn {1}", [result.data.rows.length, source?.label ?? result.data.source])}
                  {chart.truncated ? ` · ${tr("chỉ hiện 12 chuỗi có tổng lớn nhất, xem đủ ở dạng Bảng hoặc CSV")}` : ""}
                  {result.data.rows.length >= (result.spec.limit ?? 500)
                    ? ` · ${tr("đã đạt giới hạn số dòng, hãy thu hẹp khoảng thời gian")}`
                    : ""}
                </p>
              </div>
            ) : (
              <p className="grid h-[380px] place-items-center px-6 text-center text-[13px] text-muted">
                {tr("Chọn chỉ số, cách chia và bấm Vẽ biểu đồ.")}
              </p>
            )}
          </Panel>
        </div>

        <Panel
          title={tr("Biểu đồ đã lưu")}
          extra={
            <button type="button" className={smallSecondaryButtonClass} onClick={reset}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {tr("Biểu đồ mới")}
            </button>
          }
        >
          <SavedCharts charts={charts} activeId={active?.id} onOpen={open} onDelete={remove} />
        </Panel>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700"
          aria-hidden
        >
          <ChartNoAxesCombined className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">{tr("Phân tích BI")}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {tr("Chọn chỉ số theo tên nghiệp vụ, hệ thống tự truy vấn Lakehouse của công ty đang chọn và vẽ biểu đồ")}
          </p>
        </div>
      </div>
      {body}
    </div>
  );
};

export default BiAnalyticsPage;
