// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useLocation } from "react-router";

import { getDeviceId, request, wsClient } from "../api/client";

const BEAT_MS = 30_000;

const BEAT = `mutation Beat($d: String!, $p: String!) {
  insert_live_presence_one(object: {device: $d, path: $p},
    on_conflict: {constraint: presence_pkey, update_columns: [path]}) { device }
}`;

const ONLINE = `subscription Online { live_v_online(order_by: {full_name: asc}) { person_id full_name path } }`;

export type OnlinePerson = { person_id: string; full_name: string; path: string };

/** Đường dẫn gửi đi: chỉ phần path, không kèm chuỗi truy vấn hay mã băm (có thể chứa dữ liệu). */
export const presencePath = (pathname: string) => (pathname.split(/[?#]/)[0] || "/").slice(0, 200);

/** Gửi nhịp hiện diện 30 giây một lần và khi đổi trang; tab ẩn thì ngừng để không tính là đang xem. */
export const usePresenceBeat = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const send = () => {
      if (document.visibilityState !== "visible") return;
      void request(BEAT, { d: getDeviceId(), p: presencePath(pathname) }).catch(() => undefined);
    };
    send();
    const timer = setInterval(send, BEAT_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, [pathname]);
};

/** Người cùng công ty đang trực tuyến (nhịp trong 75 giây). */
export const useOnline = () => {
  const [people, setPeople] = useState<OnlinePerson[]>([]);
  useEffect(
    () =>
      wsClient.subscribe<{ live_v_online: OnlinePerson[] }>(
        { query: ONLINE },
        { next: ({ data }) => setPeople(data?.live_v_online ?? []), error: () => setPeople([]), complete: () => {} },
      ),
    [],
  );
  return people;
};
