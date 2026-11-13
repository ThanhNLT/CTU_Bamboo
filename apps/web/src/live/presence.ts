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

export const presencePath = (pathname: string) => (pathname.split(/[?#]/)[0] || "/").slice(0, 200);

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
