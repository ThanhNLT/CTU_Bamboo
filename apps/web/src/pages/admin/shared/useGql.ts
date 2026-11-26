/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

import { useCallback, useEffect, useRef, useState } from "react";

import { request, wsClient } from "../../../api/client";

export const useGql = <T>(query: string, variables?: Record<string, unknown>) => {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const vars = JSON.stringify(variables ?? {});

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await request<T>(query, JSON.parse(vars) as Record<string, unknown>);
      if (my === seq.current) {
        setData(r);
        setError(undefined);
      }
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [query, vars]);

  useEffect(() => {
    setLoading(true);
    void reload();
    const live = query.replace(/^\s*query\b/, "subscription");
    if (live === query) return undefined;
    return wsClient.subscribe<T>(
      { query: live, variables: JSON.parse(vars) as Record<string, unknown> },
      {
        next: ({ data: next }) => {
          if (!next) return;
          seq.current += 1;
          setData(next);
          setError(undefined);
          setLoading(false);
        },
        error: () => {},
        complete: () => {},
      },
    );
  }, [query, vars, reload]);

  return { data, error, loading, reload };
};
