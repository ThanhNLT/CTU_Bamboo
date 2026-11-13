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

export type Layer = "source" | "stream" | "lake" | "serving" | "consumer";

export type Direction = "upstream" | "both" | "downstream";

export type NodeStatus = "healthy" | "failed" | "affected";

export type QualityCheck = {
  rule: string;
  name: string;
  passed: boolean;
  detail: string;
  failedAt?: string;
};

export type LineageNode = {
  id: string;
  layer: Layer;
  row: number;
  tech: string;
  name: string;
  mono: boolean;
  fqn: string;
  title: string;
  owner: string;
  updated: string;
  checks: QualityCheck[];
  columns?: string[];
  usedBy?: string;
  appLink?: string;
  datasetId?: string;
};

export type LineageEdge = { from: string; to: string };

export type RunResult = "success" | "check_failed" | "failed" | "running";

export type RunRow = {
  id: string;
  task: string;
  engine: string;
  start: string;
  duration: string;
  result: RunResult;
  nodeId: string;
};
