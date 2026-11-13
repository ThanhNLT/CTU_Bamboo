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

import type { LucideIcon } from "lucide-react";

export type ParaGroup = "PROJECTS" | "AREAS" | "RESOURCES" | "ARCHIVES";

export type DriveSection = "mine" | "all" | "recent" | ParaGroup;

export type DriveNavItem = { key: DriveSection; label: string; icon: LucideIcon; badge?: number; hint?: string };

export type StorageSegment = { key: string; label: string; bytes: number; className: string };

export type DriveFolder = {
  id: string;
  name: string;
  entityType: string;
  to?: string;
  fileCount: number;
  bytes: number;
  sharedWith?: number;
  para?: ParaGroup;
};

export type ScanResult = "clean" | "infected" | "rejected" | "pending";

export type DriveFile = {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  entityId: string;
  contentType: string;
  updatedAt: string;
  updatedLabel: string;
  bytes: number | null;
  scan: ScanResult;
  locked: boolean;
  para: ParaGroup;
};

export type SortKey = "updated" | "name" | "size";

export type UploadStatus = "uploading" | "scanning" | "clean" | "blocked";

export type UploadItem = {
  id: string;
  name: string;
  progress: number;
  status: UploadStatus;
  error?: string;
};
