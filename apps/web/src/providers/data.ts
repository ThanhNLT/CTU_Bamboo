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

import type { DataProvider } from "@refinedev/core";
import hasuraDataProvider, { liveProvider as hasuraLiveProvider } from "@refinedev/hasura";

import { client, toHttpError, wsClient } from "../api/client";

const BIGINT_RESOURCES = new Set(["audit_log", "wf_approval_history"]);

const base = hasuraDataProvider(client, {
  namingConvention: "hasura-default",
  idType: (resource) => (BIGINT_RESOURCES.has(resource) ? "Int" : "uuid"),
});

export const dataProvider = Object.fromEntries(
  Object.entries(base).map(([name, fn]) => [
    name,
    typeof fn === "function"
      ? async (...args: unknown[]) => {
          try {
            return await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
          } catch (error) {
            throw toHttpError(error);
          }
        }
      : fn,
  ]),
) as unknown as DataProvider;

export const liveProvider = hasuraLiveProvider(wsClient);
