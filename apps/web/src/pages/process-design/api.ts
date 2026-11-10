import { request } from "../../api/client";
import type {
  AutomationOverview,
  Audience,
  ChangeRequest,
  DesignUnit,
  FormDef,
  Issue,
  ProcessDetail,
  ProcessSummary,
  ProcessVersion,
  Regulation,
  SandboxRun,
} from "./types";

type IssueRow = { level: Issue["level"]; message: string; element_id: string | null };

type RegulationRow = {
  kind: Regulation["kind"];
  version: number | null;
  id: string;
  doc_no: string;
  title: string;
  status: Regulation["status"];
  published_at: string | null;
};

const toRegulation = (r: RegulationRow): Regulation => ({
  kind: r.kind,
  version: r.version,
  id: r.id,
  docNo: r.doc_no,
  title: r.title,
  status: r.status,
  publishedAt: r.published_at,
});

const toIssue = (i: IssueRow): Issue => ({ level: i.level, message: i.message, elementId: i.element_id });

export const listProcesses = async (): Promise<{
  canDesign: boolean;
  designUnits: DesignUnit[];
  models: ProcessSummary[];
}> => {
  const { process_models: r } = await request<{
    process_models: {
      can_design: boolean;
      design_units: DesignUnit[];
      models: {
        id: string;
        process_key: string;
        name: string;
        description: string | null;
        owner_unit: string | null;
        audience: ProcessSummary["audience"];
        access: ProcessSummary["access"];
        updated_at: string;
        published_version: number | null;
        last_run_status: ProcessSummary["lastRunStatus"];
        runs: number;
      }[];
    };
  }>(`query { process_models { can_design design_units models { id process_key name description owner_unit audience
      access updated_at published_version last_run_status runs } } }`);
  return {
    canDesign: r.can_design,
    designUnits: r.design_units,
    models: r.models.map((m) => ({
      id: m.id,
      key: m.process_key,
      name: m.name,
      description: m.description,
      ownerUnit: m.owner_unit,
      audience: m.audience,
      access: m.access,
      updatedAt: m.updated_at,
      publishedVersion: m.published_version,
      lastRunStatus: m.last_run_status,
      runs: m.runs,
    })),
  };
};

type ChangeRequestRow = {
  id: string;
  version: number;
  message: string;
  status: ChangeRequest["status"];
  resolution_note: string | null;
  requested_by: string;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

type AutomationRow = {
  id: string;
  status: AutomationOverview["status"];
  version: number;
  activated_at: string;
  activated_by: string;
  actions: number;
  events: string[];
  webhook: boolean;
  event_catalog: { code: string; label: string }[];
  runs: {
    id: string;
    trigger: AutomationOverview["runs"][number]["trigger"];
    status: AutomationOverview["runs"][number]["status"];
    notified: number;
    error: string | null;
    steps: SandboxRun["steps"];
    variables: Record<string, unknown>;
    started_by: string;
    started_at: string;
    ended_at: string | null;
  }[];
};

const toAutomation = (a: AutomationRow): AutomationOverview => ({
  id: a.id,
  status: a.status,
  version: a.version,
  activatedAt: a.activated_at,
  activatedBy: a.activated_by,
  actions: a.actions,
  events: a.events,
  webhook: a.webhook,
  eventCatalog: a.event_catalog,
  runs: a.runs.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    notified: r.notified,
    error: r.error,
    steps: r.steps,
    variables: r.variables,
    startedBy: r.started_by,
    startedAt: r.started_at,
    endedAt: r.ended_at,
  })),
});

export const getProcess = async (id: string): Promise<ProcessDetail> => {
  const { process_model_get: m } = await request<{
    process_model_get: {
      id: string;
      process_key: string;
      name: string;
      description: string | null;
      access: ProcessDetail["access"];
      owner_unit: string | null;
      audience: ProcessDetail["audience"];
      viewing_version: number | null;
      bpmn_xml: string;
      forms: FormDef[];
      issues: IssueRow[];
      versions: {
        version: number;
        sha256: string;
        note: string | null;
        audience: ProcessVersion["audience"];
        published_by: string;
        published_at: string;
      }[];
      runs: {
        id: string;
        status: SandboxRun["status"];
        steps: SandboxRun["steps"];
        variables: Record<string, unknown> | null;
        error: string | null;
        version: number | null;
        started_by: string;
        started_at: string;
      }[];
      change_requests: ChangeRequestRow[];
      automation: AutomationRow | null;
      regulations: RegulationRow[];
    };
  }>(
    `query Get($id: uuid!) { process_model_get(id: $id) { id process_key name description access owner_unit audience
      viewing_version bpmn_xml forms issues { level message element_id }
      versions { version sha256 note audience published_by published_at }
      runs { id status steps variables error version started_by started_at } change_requests automation
      regulations } }`,
    { id },
  );
  return {
    id: m.id,
    key: m.process_key,
    name: m.name,
    description: m.description,
    access: m.access,
    ownerUnit: m.owner_unit,
    audience: m.audience,
    viewingVersion: m.viewing_version,
    xml: m.bpmn_xml,
    forms: m.forms,
    issues: m.issues.map(toIssue),
    versions: m.versions.map((v): ProcessVersion => ({
      version: v.version,
      sha256: v.sha256,
      note: v.note,
      audience: v.audience,
      publishedBy: v.published_by,
      publishedAt: v.published_at,
    })),
    runs: m.runs.map((r) => ({
      id: r.id,
      status: r.status,
      steps: r.steps,
      variables: r.variables,
      error: r.error,
      version: r.version,
      startedBy: r.started_by,
      startedAt: r.started_at,
    })),
    automation: m.automation && toAutomation(m.automation),
    regulations: m.regulations.map(toRegulation),
    changeRequests: (m.change_requests as unknown as ChangeRequestRow[]).map((c): ChangeRequest => ({
      id: c.id,
      version: c.version,
      message: c.message,
      status: c.status,
      resolutionNote: c.resolution_note,
      requestedBy: c.requested_by,
      requestedAt: c.requested_at,
      resolvedBy: c.resolved_by,
      resolvedAt: c.resolved_at,
    })),
  };
};

export const validateProcess = async (xml: string, forms: FormDef[]): Promise<Issue[]> => {
  const r = await request<{ process_model_validate: IssueRow[] }>(
    `query Validate($x: String!, $f: jsonb) { process_model_validate(bpmn_xml: $x, forms: $f) {
      level message element_id } }`,
    { x: xml, f: forms },
  );
  return r.process_model_validate.map(toIssue);
};

export const saveProcess = async (input: {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  xml: string;
  forms: FormDef[];
  ownerUnitId?: string | null;
}): Promise<{ id: string; issues: Issue[] }> => {
  const r = await request<{ process_model_save: { id: string; issues: IssueRow[] } }>(
    `mutation Save($id: uuid, $k: String!, $n: String!, $d: String, $x: String!, $f: jsonb, $u: uuid) {
      process_model_save(id: $id, process_key: $k, name: $n, description: $d, bpmn_xml: $x, forms: $f,
        owner_unit_id: $u) { id issues { level message element_id } } }`,
    {
      id: input.id ?? null,
      k: input.key,
      n: input.name,
      d: input.description ?? null,
      x: input.xml,
      f: input.forms,
      u: input.ownerUnitId ?? null,
    },
  );
  return { id: r.process_model_save.id, issues: r.process_model_save.issues.map(toIssue) };
};

export const publishProcess = async (id: string, audience: Audience, note?: string) => {
  const r = await request<{ process_model_publish: { version: number; notified: number } }>(
    `mutation Publish($id: uuid!, $n: String, $a: String) {
      process_model_publish(id: $id, note: $n, audience: $a) { version notified } }`,
    { id, n: note ?? null, a: audience },
  );
  return r.process_model_publish;
};

export const requestChange = async (id: string, message: string) => {
  await request(
    `mutation Change($id: uuid!, $m: String!) { process_change_request_create(id: $id, message: $m) { id } }`,
    { id, m: message },
  );
};

export const resolveChange = async (id: string, outcome: "RESOLVED" | "DECLINED", note: string) => {
  await request(
    `mutation Resolve($id: uuid!, $o: String, $n: String) {
      process_change_request_resolve(id: $id, outcome: $o, note: $n) { id } }`,
    { id, o: outcome, n: note || null },
  );
};

export const runSandbox = async (id: string, variables: Record<string, unknown>): Promise<SandboxRun> => {
  const r = await request<{ process_sandbox_run: SandboxRun }>(
    `mutation Run($id: uuid!, $v: jsonb) { process_sandbox_run(id: $id, variables: $v) { id status error steps } }`,
    { id, v: variables },
  );
  return r.process_sandbox_run;
};

export const deleteProcess = async (id: string) => {
  await request(`mutation Del($id: uuid!) { process_model_delete(id: $id) { id } }`, { id });
};

export const getProcessVersion = async (id: string, version: number) => {
  const r = await request<{
    process_version_get: { version: number; bpmn_xml: string; forms: FormDef[] };
  }>(`query Ver($id: uuid!, $v: Int!) { process_version_get(id: $id, version: $v) { version bpmn_xml forms } }`, {
    id,
    v: version,
  });
  return {
    version: r.process_version_get.version,
    xml: r.process_version_get.bpmn_xml,
    forms: r.process_version_get.forms,
  };
};

export const enableAutomation = async (id: string) => {
  await request(`mutation On($id: uuid!) { process_automation_enable(id: $id) { id status version } }`, { id });
};

export const setAutomationEvents = async (id: string, events: string[]) => {
  await request(`mutation Ev($id: uuid!, $e: [String!]!) { process_automation_events(id: $id, events: $e) { id } }`, {
    id,
    e: events,
  });
};

export const createAutomationWebhook = async (id: string): Promise<string> => {
  const r = await request<{ process_automation_webhook: { path: string } }>(
    `mutation Hook($id: uuid!) { process_automation_webhook(id: $id) { id token path } }`,
    { id },
  );
  return r.process_automation_webhook.path;
};

export const disableAutomation = async (id: string) => {
  await request(`mutation Off($id: uuid!) { process_automation_disable(id: $id) { id status version } }`, { id });
};

export const startAutomation = async (id: string, variables: Record<string, unknown>) => {
  await request(
    `mutation Start($id: uuid!, $v: jsonb) { process_automation_start(id: $id, variables: $v) { id status version } }`,
    { id, v: variables },
  );
};

export type FromDocumentResult = {
  id: string;
  name: string;
  steps: number;
  source: string;
  issues: Issue[];
  warnings: string[];
};

/** Đọc tài liệu đang hiệu lực trong thư viện tri thức theo mẫu quy trình và dựng bản nháp sơ đồ. */
export const processFromDocument = async (documentId: string, ownerUnitId?: string): Promise<FromDocumentResult> => {
  const r = await request<{
    process_from_document: Omit<FromDocumentResult, "issues"> & { issues: IssueRow[] };
  }>(
    `mutation FromDoc($d: uuid!, $u: uuid) { process_from_document(document_id: $d, owner_unit_id: $u) {
      id name steps source warnings issues { level message element_id } } }`,
    { d: documentId, u: ownerUnitId ?? null },
  );
  return { ...r.process_from_document, issues: r.process_from_document.issues.map(toIssue) };
};

export type RegulationResult = {
  documentId: string;
  docNo: string;
  status: Regulation["status"];
  version: number;
  files: string[];
  submitted: boolean;
  message: string | null;
};

/** Lập văn bản quy định từ phiên bản đã phát hành và đề xuất vào thư viện tri thức (có thể gửi duyệt luôn). */
export const draftRegulation = async (id: string, submit: boolean, version?: number): Promise<RegulationResult> => {
  const r = await request<{
    process_regulation_draft: {
      document_id: string;
      doc_no: string;
      status: Regulation["status"];
      version: number;
      files: string[];
      submitted: boolean;
      message: string | null;
    };
  }>(
    `mutation Reg($id: uuid!, $s: Boolean, $v: Int) { process_regulation_draft(id: $id, submit: $s, version: $v) {
      document_id doc_no status version files submitted message } }`,
    { id, s: submit, v: version ?? null },
  );
  const d = r.process_regulation_draft;
  return {
    documentId: d.document_id,
    docNo: d.doc_no,
    status: d.status,
    version: d.version,
    files: d.files,
    submitted: d.submitted,
    message: d.message,
  };
};

export type ScriptTest = {
  ok: boolean;
  error: string | null;
  line: number | null;
  outputs: Record<string, unknown>;
  log: string[];
  steps: number;
};

/** Chạy thử kịch bản của tác vụ tự động với biến mẫu (ADR #73), không đụng dữ liệu. */
export const testScript = async (modelId: string, script: string, variables: Record<string, unknown>) => {
  const { process_script_test } = await request<{ process_script_test: ScriptTest }>(
    `mutation St($m: uuid!, $s: String!, $v: jsonb) {
      process_script_test(model_id: $m, script: $s, variables: $v) { ok error line outputs log steps } }`,
    { m: modelId, s: script, v: variables },
  );
  return process_script_test;
};
