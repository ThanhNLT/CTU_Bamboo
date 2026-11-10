/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
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
