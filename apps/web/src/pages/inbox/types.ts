export type SlaLevel = "overdue" | "urgent" | "ok";

export type InboxScope = "mine" | "team";

export type Attachment = {
  id: string;
  name: string;
  kind: "pdf" | "image" | "file";
  pages: number;
  sha256: string | null;
  scan: "clean" | "blocked" | "pending";
};

export type TaskInfo = {
  submitter: string;
  unit: string;
  device?: { label: string; to: string };
  phone?: string;
  dataTier?: string;
  amount?: string;
};

export type AiSuggestion = {
  bullets: string[];
  citation?: { label: string; to: string };
};

export type DocPreview = { org: string; heading: string; subline: string };

export type InboxTask = {
  id: string;
  taskId: string;
  code: string;
  title: string;
  level: number;
  assignee: string;
  actionable: boolean;
  viaDelegation: boolean;
  to: string;
  dueAt: string;
  sla: { level: SlaLevel; label: string };
  attachments: Attachment[];
  info: TaskInfo;
  ai?: AiSuggestion;
  preview: DocPreview;
};

export type Decision = "approve" | "return" | "reject";
