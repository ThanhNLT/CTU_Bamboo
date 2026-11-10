/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { App } from "antd";
import { Copy, FileJson, KeyRound, Timer } from "lucide-react";

import { Panel } from "../../../components/ui";
import { smallSecondaryButtonClass } from "../../../components/ui/buttons";
import { copyText } from "../../../utils/clipboard";
import { cn } from "../../../utils/cn";
import { baseUrl, curlOf } from "../api";
import type { Catalog } from "../types";
import { tr, trf } from "../../../i18n";

const METHOD = { GET: "bg-bamboo-50 text-bamboo-800", POST: "bg-amber-50 text-amber-900" } as const;

const Fact = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 items-start gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui bg-bamboo-50 text-bamboo-700" aria-hidden>
      {icon}
    </span>
    <div className="min-w-0 text-[12.5px] text-body">
      <p className="m-0 font-medium text-ink">{title}</p>
      {children}
    </div>
  </div>
);

/** Tài liệu cổng dịch vụ API sinh từ danh mục endpoint của máy chủ (cùng nguồn với /api/v1/openapi.json). */
export const ApiDocs = ({ catalog }: { catalog: Catalog }) => {
  const { message } = App.useApp();
  const copy = async (text: string) => {
    await copyText(text);
    message.success(tr("Đã sao chép."));
  };
  const groups = catalog.scopes
    .map((s) => ({ scope: s, endpoints: catalog.endpoints.filter((e) => e.scope === s.name) }))
    .filter((g) => g.endpoints.length);

  return (
    <div className="flex flex-col gap-4">
      <Panel title={tr("Bắt đầu")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Fact icon={<KeyRound className="h-4 w-4" />} title={tr("Xác thực bằng khóa API")}>
            <p className="m-0">
              {tr("Gửi")} <code className="font-mono text-[11.5px]">Authorization: Bearer bak_…</code>.{" "}
              {tr("Khóa gọi thay mặt người tạo, chỉ trong phạm vi đã chọn; quản trị viên công ty tạo và thu hồi khóa.")}
            </p>
          </Fact>
          <Fact icon={<Timer className="h-4 w-4" />} title={tr("Giới hạn")}>
            <p className="m-0">
              {tr(
                "300 lượt mỗi phút cho mỗi khóa (vượt thì trả 429), thân yêu cầu tối đa 1 MB, khóa hết hạn sau tối đa một năm.",
              )}
            </p>
          </Fact>
          <Fact icon={<FileJson className="h-4 w-4" />} title={tr("Đặc tả OpenAPI 3.1")}>
            <p className="m-0">
              <a
                href="/api/v1/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11.5px] text-bamboo-700"
              >
                /api/v1/openapi.json
              </a>{" "}
              {tr("· dùng để sinh client hoặc nhập vào Postman, Insomnia.")}
            </p>
          </Fact>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2">
          <span className="text-[12px] text-muted">{tr("Địa chỉ gốc")}</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{baseUrl()}</code>
          <button type="button" className={smallSecondaryButtonClass} onClick={() => void copy(baseUrl())}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {tr("Sao chép")}
          </button>
        </div>
      </Panel>

      {groups.map(({ scope, endpoints }) => (
        <Panel
          key={scope.name}
          title={scope.label}
          extra={
            <code className="rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-[11.5px] text-body">
              {scope.name}
            </code>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {endpoints.map((e) => (
              <li
                key={`${e.method} ${e.path}`}
                className="min-w-0 border-t border-line pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold", METHOD[e.method])}>
                    {e.method}
                  </span>
                  <code className="min-w-0 break-all font-mono text-[13px] text-ink">{e.path}</code>
                </div>
                <p className="m-0 mt-1.5 text-[12.5px] text-body">{e.summary}</p>
                {e.params.length > 0 && (
                  <table className="mt-2 w-full max-w-[720px] text-left text-[12px]">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1 pr-3 font-medium">{e.body ? tr("Trường JSON") : tr("Tham số")}</th>
                        <th className="py-1 pr-3 font-medium">{tr("Kiểu")}</th>
                        <th className="py-1 font-medium">{tr("Mô tả")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.params.map((p) => (
                        <tr key={p.name} className="border-t border-line">
                          <td className="py-1 pr-3 font-mono text-ink">{p.name}</td>
                          <td className="py-1 pr-3 font-mono text-muted">{p.type}</td>
                          <td className="py-1 text-body">{p.description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="relative mt-2">
                  <pre className="m-0 overflow-x-auto rounded-xl bg-black/[0.04] px-3 py-2.5 pr-12 font-mono text-[11.5px] leading-relaxed text-ink">
                    {curlOf(e)}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void copy(curlOf(e))}
                    aria-label={trf("Sao chép ví dụ {0}", [e.path])}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-black/[0.06] hover:text-ink"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
};
