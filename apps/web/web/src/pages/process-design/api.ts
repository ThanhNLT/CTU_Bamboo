// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import { request } from "../../api/client";
import type { FormDef, Issue, ProcessDetail, ProcessSummary, ProcessVersion, SandboxRun } from "./types";

type IssueRow = { level: Issue["level"]; message: string; element_id: string | null };

const toIssue = (i: IssueRow): Issue => ({ level: i.level, message: i.message, elementId: i.element_id });

export const listProcesses = async (): Promise<{ canDesign: boolean; models: ProcessSummary[] }> => {
  const { process_models: r } = await request<{
    process_models: {
      can_design: boolean;
      models: {
        id: string;
        process_key: string;
        name: string;
        description: string | null;
        updated_at: string;
        published_version: number | null;
        last_run_status: ProcessSummary["lastRunStatus"];
        runs: number;
      }[];
    };
  }>(`query { process_models { can_design models { id process_key name description updated_at published_version
      last_run_status runs } } }`);
  return {
    canDesign: r.can_design,
    models: r.models.map((m) => ({
      id: m.id,
      key: m.process_key,
      name: m.name,
      description: m.description,
      updatedAt: m.updated_at,
      publishedVersion: m.published_version,
      lastRunStatus: m.last_run_status,
      runs: m.runs,
    })),
  };
};

export const getProcess = async (id: string): Promise<ProcessDetail> => {
  const { process_model_get: m } = await request<{
    process_model_get: {
      id: string;
      process_key: string;
      name: string;
      description: string | null;
      bpmn_xml: string;
      forms: FormDef[];
      issues: IssueRow[];
      versions: {
        version: number;
        sha256: string;
        note: string | null;
        published_by: string;
        published_at: string;
      }[];
      runs: {
        id: string;
        status: SandboxRun["status"];
        steps: SandboxRun["steps"];
        variables: Record<string, unknown> | null;
        error: string | null;
        started_by: string;
        started_at: string;
      }[];
    };
  }>(
    `query Get($id: uuid!) { process_model_get(id: $id) { id process_key name description bpmn_xml forms
      issues { level message element_id } versions { version sha256 note published_by published_at }
      runs { id status steps variables error started_by started_at } } }`,
    { id },
  );
  return {
    id: m.id,
    key: m.process_key,
    name: m.name,
    description: m.description,
    xml: m.bpmn_xml,
    forms: m.forms,
    issues: m.issues.map(toIssue),
    versions: m.versions.map((v): ProcessVersion => ({
      version: v.version,
      sha256: v.sha256,
      note: v.note,
      publishedBy: v.published_by,
      publishedAt: v.published_at,
    })),
    runs: m.runs.map((r) => ({
      id: r.id,
      status: r.status,
      steps: r.steps,
      variables: r.variables,
      error: r.error,
      startedBy: r.started_by,
      startedAt: r.started_at,
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
}): Promise<{ id: string; issues: Issue[] }> => {
  const r = await request<{ process_model_save: { id: string; issues: IssueRow[] } }>(
    `mutation Save($id: uuid, $k: String!, $n: String!, $d: String, $x: String!, $f: jsonb) {
      process_model_save(id: $id, process_key: $k, name: $n, description: $d, bpmn_xml: $x, forms: $f) {
        id issues { level message element_id } } }`,
    { id: input.id ?? null, k: input.key, n: input.name, d: input.description ?? null, x: input.xml, f: input.forms },
  );
  return { id: r.process_model_save.id, issues: r.process_model_save.issues.map(toIssue) };
};

export const publishProcess = async (id: string, note?: string) => {
  const r = await request<{ process_model_publish: { version: number } }>(
    `mutation Publish($id: uuid!, $n: String) { process_model_publish(id: $id, note: $n) { version } }`,
    { id, n: note ?? null },
  );
  return r.process_model_publish.version;
};

export const runSandbox = async (id: string, variables: Record<string, unknown>): Promise<SandboxRun> => {
  const r = await request<{ process_sandbox_run: SandboxRun }>(
    `mutation Run($id: uuid!, $v: jsonb) { process_sandbox_run(id: $id, variables: $v) { id status error steps } }`,
    { id, v: variables },
  );
  return r.process_sandbox_run;
};
