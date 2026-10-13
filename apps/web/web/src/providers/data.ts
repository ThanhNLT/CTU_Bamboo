// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// ===== Thư viện =====
import type { DataProvider } from "@refinedev/core"; // Refine
import hasuraDataProvider, { liveProvider as hasuraLiveProvider } from "@refinedev/hasura"; // Refine Hasura

// ===== Module nội bộ =====
import { client, toHttpError, wsClient } from "../api/client";

// ===== Hằng số =====
// Bảng dùng khóa số (bigint) thay cho uuid.
const BIGINT_RESOURCES = new Set(["audit_log", "wf_approval_history"]);

const base = hasuraDataProvider(client, {
  namingConvention: "hasura-default",
  idType: (resource) => (BIGINT_RESOURCES.has(resource) ? "Int" : "uuid"),
});

// Bọc mọi hàm để lỗi Hasura hiện đúng thông điệp nghiệp vụ (tiếng Việt) trên thông báo của Refine.
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
