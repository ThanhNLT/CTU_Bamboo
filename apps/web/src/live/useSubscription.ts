/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.0
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

import { useEffect, useRef, useState } from "react";

import { wsClient } from "../api/client";
import { trServer } from "../i18n/server";

export const useSubscription = <T>(query: string, variables: Record<string, unknown> = {}, skip = false) => {
  const [state, setState] = useState<{ data?: T; error?: string; connected: boolean }>({ connected: false });
  const key = JSON.stringify(variables);
  const vars = useRef(variables);
  vars.current = variables;

  useEffect(() => {
    if (skip) return;
    let alive = true;
    const dispose = wsClient.subscribe<T>(
      { query, variables: vars.current },
      {
        next: ({ data, errors }) => {
          if (!alive) return;
          if (errors?.length) setState((s) => ({ ...s, error: trServer(errors[0].message) }));
          else if (data) setState({ data, connected: true });
        },
        error: (e) => alive && setState((s) => ({ ...s, connected: false, error: (e as Error)?.message })),
        complete: () => alive && setState((s) => ({ ...s, connected: false })),
      },
    );
    return () => {
      alive = false;
      dispose();
    };
  }, [query, key, skip]);

  return state;
};
