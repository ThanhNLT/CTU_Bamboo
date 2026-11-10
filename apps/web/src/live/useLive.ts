/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

import { useEffect, useRef, useState } from "react";

import { wsClient } from "../api/client";

/** Chủ đề tín hiệu thay đổi (trigger `live.track` ở migration 052, ADR #64; lịch 053, dự án 054). */
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

/**
 * Gọi `onChange` khi dữ liệu thuộc các chủ đề đổi (do bất kỳ ai, ở bất kỳ thiết bị nào trong công ty), gộp các thay đổi
 * dồn dập trong `debounceMs`. Một subscription Hasura duy nhất cho mỗi lần dùng; Hasura gộp truy vấn giống nhau của mọi
 * người dùng thành một lần đọc mỗi giây. Trả thời điểm thay đổi gần nhất và trạng thái kết nối để hiện "Trực tiếp".
 */
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
