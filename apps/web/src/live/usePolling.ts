/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.1
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

import { useEffect, useRef } from "react";

/** Gọi `fn` mỗi `ms` khi tab đang hiển thị; tab ẩn thì ngừng hỏi máy chủ (để dịch vụ ngủ được, ADR #53) và hỏi bù
 * ngay khi tab hiện lại nếu đã quá hạn. Lần tải đầu do nơi gọi tự làm. */
export const usePolling = (fn: () => void, ms: number, enabled = true) => {
  const callback = useRef(fn);
  callback.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      callback.current();
    };
    const timer = window.setInterval(tick, ms);
    const onVisible = () => {
      if (Date.now() - last >= ms) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms, enabled]);
};
