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
