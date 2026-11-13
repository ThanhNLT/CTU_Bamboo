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

export type LiveTopic =
  | "approval"
  | "procurement"
  | "ic"
  | "production"
  | "hr"
  | "iot"
  | "kpi"
  | "lineage"
  | "files"
  | "knowledge"
  | "org"
  | "calendar"
  | "project";

const LATEST = `subscription Live($t: [String!]) {
  live_event(where: {topic: {_in: $t}}, order_by: {id: desc}, limit: 1) { id at }
}`;

export const useLiveTopics = (topics: readonly LiveTopic[], onChange: () => void, debounceMs = 1500) => {
  const [state, setState] = useState<{ connected: boolean; changedAt?: Date }>({ connected: false });
  const callback = useRef(onChange);
  callback.current = onChange;
  const key = [...topics].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let last: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = wsClient.subscribe<{ live_event: { id: number; at: string }[] }>(
      { query: LATEST, variables: { t: key.split(",") } },
      {
        next: ({ data }) => {
          const top = data?.live_event?.[0];
          const id = top?.id ?? 0;
          setState((s) => (s.connected ? s : { ...s, connected: true }));
          if (last !== null && id !== last) {
            clearTimeout(timer);
            timer = setTimeout(() => {
              setState({ connected: true, changedAt: top ? new Date(top.at) : new Date() });
              callback.current();
            }, debounceMs);
          }
          last = id;
        },
        error: () => setState((s) => ({ ...s, connected: false })),
        complete: () => setState((s) => ({ ...s, connected: false })),
      },
    );
    return () => {
      clearTimeout(timer);
      dispose();
    };
  }, [key, debounceMs]);

  return state;
};
