// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Button, Input } from "antd";
import { Play } from "lucide-react";
import { useState } from "react";

import { testScript, type ScriptTest } from "../api";
import { tr, trf } from "../../../i18n";

export const SCRIPT_SAMPLE = tr(
  '# Biến của quy trình dùng trực tiếp theo tên, ví dụ amount, doc_no\nmuc = "cao" if amount >= 50_000_000 else "thuong"\ncan_bao_gia = amount >= 50_000_000\nhan = add_days(today(), 7)\nlog("muc duyet", muc)',
);

/** Ô soạn kịch bản của tác vụ tự động (ADR #73) kèm chạy thử với biến mẫu. */
export const ScriptField = ({
  value,
  readOnly,
  modelId,
  elementId,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  modelId?: string;
  elementId: string;
  onChange: (v: string) => void;
}) => {
  const [sample, setSample] = useState('{"amount": 60000000}');
  const [result, setResult] = useState<
    ScriptTest | { ok: false; error: string; outputs?: undefined; log?: undefined }
  >();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!modelId) return;
    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(sample || "{}");
    } catch {
      setResult({ ok: false, error: tr("Biến mẫu không phải JSON hợp lệ") });
      return;
    }
    setBusy(true);
    try {
      setResult(await testScript(modelId, value, variables));
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="block text-[12px] font-medium text-body">{tr("Kịch bản")}</span>
        <Input.TextArea
          aria-label={tr("Kịch bản")}
          className="mt-1 font-mono text-[12px]"
          autoSize={{ minRows: 6, maxRows: 18 }}
          maxLength={8000}
          spellCheck={false}
          disabled={readOnly}
          placeholder={SCRIPT_SAMPLE}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="mt-1 block text-[11.5px] text-muted">
          {tr(
            "Cú pháp Python rút gọn: gán, if, for, while, f-string, list/dict. Hàm: len, min, max, sum, round, sorted, today(), now(), add_days(), days_between(), log(). Không import, không truy cập tệp hay mạng; tối đa 2 giây.",
          )}{" "}
          {trf("Biến kiểu đơn được gán thành biến quy trình; {0}_ok báo đã chạy xong.", [elementId])}
        </span>
      </label>
      {!readOnly && modelId && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas p-2.5">
          <span className="text-[12px] font-medium text-body">{tr("Chạy thử với biến mẫu (JSON)")}</span>
          <Input
            aria-label={tr("Biến mẫu")}
            className="font-mono text-[12px]"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          />
          <Button size="small" icon={<Play className="h-3.5 w-3.5" />} loading={busy} onClick={() => void run()}>
            {tr("Chạy thử")}
          </Button>
          {result && (
            <div className="text-[12px]" role="status">
              {result.ok ? (
                <>
                  <span className="font-medium text-bamboo-800">{tr("Chạy được. Biến sau bước:")}</span>
                  <pre className="m-0 mt-1 max-h-40 overflow-auto rounded-md bg-surface p-2 font-mono text-[11.5px]">
                    {JSON.stringify(result.outputs, null, 2)}
                  </pre>
                  {result.log && result.log.length > 0 && (
                    <pre className="m-0 mt-1 max-h-28 overflow-auto rounded-md bg-surface p-2 font-mono text-[11.5px] text-muted">
                      {result.log.join("\n")}
                    </pre>
                  )}
                </>
              ) : (
                <span className="text-red-700">{result.error}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
