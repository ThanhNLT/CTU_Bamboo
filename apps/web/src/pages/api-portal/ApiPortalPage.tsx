// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { Alert, Segmented, Spin } from "antd";
import { Waypoints } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { fetchCatalog, fetchIsAdmin, fetchKeys } from "./api";
import { ApiDocs } from "./components/ApiDocs";
import { ApiKeys } from "./components/ApiKeys";
import { MqttAccounts } from "./components/MqttAccounts";
import type { ApiKey, Catalog } from "./types";
import { tr } from "../../i18n";

type Tab = "docs" | "keys" | "mqtt";

/** Cổng dịch vụ API (ADR #64): tài liệu REST /api/v1 cho mọi người, khóa API cho quản trị viên công ty. */
export const ApiPortalPage = () => {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [tab, setTab] = useState<Tab>("docs");
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await fetchKeys());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [cat, admin] = await Promise.all([fetchCatalog(), fetchIsAdmin()]);
        setCatalog(cat);
        setIsAdmin(admin);
        if (admin) await loadKeys();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [loadKeys]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bamboo-50 text-bamboo-700"
            aria-hidden
          >
            <Waypoints className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {tr("Cổng dịch vụ API")}
            </h1>
            <p className="mt-1 text-[13px] text-muted">
              {tr(
                "Kết nối hệ thống bên ngoài với số liệu của công ty qua REST, có khóa riêng, phạm vi và nhật ký dùng",
              )}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "docs", label: tr("Tài liệu API") },
              { value: "keys", label: tr("Khóa API") },
              { value: "mqtt", label: tr("Thiết bị MQTT") },
            ]}
          />
        )}
      </div>

      {error && <Alert type="error" showIcon message={tr("Không tải được cổng dịch vụ API")} description={error} />}
      {!catalog && !error && <Spin className="m-10" />}
      {catalog && tab === "docs" && <ApiDocs catalog={catalog} />}
      {catalog && tab === "keys" && isAdmin && (
        <ApiKeys keys={keys} scopes={catalog.scopes} onChanged={() => void loadKeys()} />
      )}
      {catalog && tab === "mqtt" && isAdmin && <MqttAccounts />}
      {catalog && !isAdmin && (
        <p className="m-0 text-[12.5px] text-muted">
          {tr("Cần khóa API? Quản trị viên công ty tạo khóa ở trang này, chọn phạm vi và hạn dùng.")}
        </p>
      )}
    </div>
  );
};

export default ApiPortalPage;
