// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useSession } from "../auth/useSession";
import { fetchModules, type ModuleOverview } from "./api";
import { ModulesContext, type ModulesValue } from "./useModules";

export const ModulesProvider = ({ children }: { children: ReactNode }) => {
  const { tenant } = useSession();
  const [overview, setOverview] = useState<ModuleOverview>();
  const [ready, setReady] = useState(false);

  const reload = useCallback(
    () =>
      fetchModules()
        .then(setOverview)
        .catch(() => setOverview(undefined))
        .finally(() => setReady(true)),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload, tenant.tenant_id]);

  const value = useMemo<ModulesValue>(() => {
    const on = new Set(overview?.modules.filter((m) => m.enabled).map((m) => m.code));
    return {
      overview,
      ready,
      enabled: (code) => !code || !overview || on.has(code),
      update: setOverview,
      reload,
    };
  }, [overview, ready, reload]);

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
};
