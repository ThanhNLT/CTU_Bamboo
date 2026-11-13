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

export type ResultType = "record" | "document" | "knowledge" | "twin" | "data";
export type Company = "chip" | "phone" | "appliance" | "hospital";
export type SearchMode = "keyword" | "semantic" | "hybrid";
export type SortKey = "relevance" | "newest";
export type TimeRange = "7d" | "30d" | "90d" | "all";

export type Concept = {
  key: string;
  label: string;
  synonyms: string[];
  triggers: string[];
  highlights: string[];
};

export type SearchResult = {
  key: string;
  type: ResultType;
  company?: Company;
  title: string;
  code?: string;
  breadcrumb: string;
  snippet?: string;
  snippetHtml?: string;
  to: string;
  semantic?: number;
  keyword: boolean;
  score: number;
  daysAgo?: number;
  updatedLabel?: string;
  matchedField?: string;
  status?: string;
  attachmentId?: string;
  mono?: boolean;
};
