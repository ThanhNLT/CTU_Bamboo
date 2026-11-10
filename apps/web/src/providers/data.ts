/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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
