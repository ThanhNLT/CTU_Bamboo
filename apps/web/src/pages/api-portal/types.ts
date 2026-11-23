/**
 * Bamboo - DX-OS Open-Core
 * @version 0.5.2
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

export type Scope = { name: string; label: string };
export type Param = { name: string; type: string; description: string };
export type Endpoint = {
  method: "GET" | "POST";
  path: string;
  scope: string;
  summary: string;
  params: Param[];
  body: boolean;
};
export type Catalog = { scopes: Scope[]; endpoints: Endpoint[] };

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  allowed_ips: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  last_ip: string | null;
  created_by_person: { full_name: string } | null;
  usages: { day: string; calls: number; errors: number }[];
};

export type KeyInput = { name: string; scopes: string[]; expires_days: number; allowed_ips: string[] };
export type CreatedKey = { id: string; key: string; prefix: string; expires_at: string };
