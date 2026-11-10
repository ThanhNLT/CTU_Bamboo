/**
 * Bamboo - DX-OS Open-Core
 * @version 0.4.0
 * @author CTUBamboo
 * @copyright Copyright 2026 Bamboo
 * @license Apache-2.0
 * @see https://github.com/CTUBamboo/Bamboo, Bamboo project
 */

export type StepState = "done" | "active" | "running" | "pending";

export type Step = { key: string; title: string; sub: string; state: StepState };

export type Field<T = string> = { value: T; confidence: number; source: string | null } | null;

export type ParsedItem = {
  line_no: number;
  description: string;
  uom: string;
  quantity: string;
  unit_price: string;
  amount: string;
  item_code: string | null;
  note: string | null;
  consistent: boolean;
  confidence: number;
};

export type Parsed = {
  doc_type: NonNullable<Field>;
  doc_no: Field;
  date: Field;
  supplier_name: Field;
  supplier_tax_code: Field;
  supplier_address: Field;
  items: ParsedItem[];
  net_amount: Field;
  vat: { rate: number; amount: string; confidence: number } | null;
  total_amount: Field;
  warnings: string[];
};

export type CatalogMatch = {
  id: string;
  code: string;
  name: string;
  uom: string;
  category_code: string | null;
  ref_price: string | null;
};

export type Phase = "SCANNING" | "QUEUED" | "OCR" | "READY" | "ERROR" | "REJECTED" | "UNSUPPORTED";

export type OcrDocument = {
  attachment_id: string;
  file_name: string;
  scan_status: string;
  phase: Phase;
  message: string | null;
  ocr: { pages_total: number | null; pages_done: number; note: string | null; error: string | null } | null;
  text: string | null;
  parsed: Parsed | null;
  partner: { id: string; code: string; name: string; by: "tax_code" | "name" } | null;
  item_matches: (CatalogMatch | null)[] | null;
  doc_label: string | null;
};

export type Row = {
  key: number;
  description: string;
  uom: string;
  quantity: string;
  unit_price: string;
  item_id: string | null;
  item_code: string | null;
  note: string | null;
  confidence: number;
  sourceAmount: string;
};

export type RecentImport = {
  id: string;
  file_name: string;
  created_at: string;
  entity_id: string;
  ocr: { status: string } | null;
};
