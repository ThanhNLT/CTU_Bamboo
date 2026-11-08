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
