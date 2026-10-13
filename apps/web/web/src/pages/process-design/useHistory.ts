// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from "react";

const LIMIT = 100;
const COALESCE_MS = 800;

type State<T> = { past: T[]; present: T; future: T[]; lastKey?: string; lastAt: number };

/**
 * Lịch sử hoàn tác/làm lại. `set(next, key)`: các thay đổi liên tiếp cùng `key` trong 0,8 giây gộp làm một
 * bước (gõ chữ vào ô "Tên bước" không tạo một bước hoàn tác cho mỗi phím).
 */
export const useHistory = <T>(initial: T) => {
  const [s, setS] = useState<State<T>>({ past: [], present: initial, future: [], lastAt: 0 });

  const set = useCallback((next: T | ((prev: T) => T), key?: string) => {
    setS((st) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(st.present) : next;
      const now = Date.now();
      const merge = key !== undefined && key === st.lastKey && now - st.lastAt < COALESCE_MS;
      return {
        past: merge ? st.past : [...st.past, st.present].slice(-LIMIT),
        present: value,
        future: [],
        lastKey: key,
        lastAt: now,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setS((st) =>
      st.past.length === 0
        ? st
        : {
            past: st.past.slice(0, -1),
            present: st.past[st.past.length - 1],
            future: [st.present, ...st.future],
            lastAt: 0,
          },
    );
  }, []);

  const redo = useCallback(() => {
    setS((st) =>
      st.future.length === 0
        ? st
        : {
            past: [...st.past, st.present],
            present: st.future[0],
            future: st.future.slice(1),
            lastAt: 0,
          },
    );
  }, []);

  /** Thay toàn bộ (đổi sang quy trình khác): xóa lịch sử. */
  const reset = useCallback((value: T) => setS({ past: [], present: value, future: [], lastAt: 0 }), []);

  return { value: s.present, set, undo, redo, reset, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
};
