// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

import gql from "graphql-tag";

export const TR_LIST = gql`
  query TransferRequests(
    $limit: Int
    $offset: Int
    $order_by: [hr_transfer_request_order_by!]
    $where: hr_transfer_request_bool_exp
  ) {
    hr_transfer_request(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      doc_no
      status
      effective_date
      created_at
      person {
        full_name
        employee_code
      }
      source_position {
        name
        org_unit {
          name
        }
      }
      target_unit {
        name
      }
      requester {
        full_name
      }
    }
    hr_transfer_request_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const TR_DETAIL = `
  query Transfer($id: uuid!) {
    hr_transfer_request_by_pk(id: $id) {
      id doc_no status approval_round created_at updated_at effective_date reason requester_kind
      requester_id person_id source_position_id target_unit_id target_position_id
      requester { full_name }
      requester_position { name org_unit { name } }
      person { full_name employee_code }
      source_position { name org_unit { name } }
      target_unit { name }
      target_position { name }
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
    }
  }
`;

export const TR_OPTIONS = `
  query TransferOptions {
    core_assignment(where: {assignment_type: {_in: ["PRIMARY", "CONCURRENT"]}}) {
      id person_id position_id valid_period
      person { full_name employee_code }
      position { name org_unit { name } }
    }
    core_org_unit(order_by: {path: asc}) { id name path }
  }
`;

export const TR_TARGET_POSITIONS = `
  query TransferTargetPositions($unit: uuid!) {
    core_position(where: {org_unit_id: {_eq: $unit}, is_head: {_eq: false}}, order_by: {name: asc}) {
      id name valid_period
      assignments { valid_period }
    }
  }
`;

export const TR_CREATE = `
  mutation CreateTransfer($person: uuid!, $source: uuid!, $unit: uuid!, $effective: date!, $reason: String!) {
    create_transfer_request(person_id: $person, source_position_id: $source, target_unit_id: $unit,
                            effective_date: $effective, reason: $reason) { request_id status }
  }
`;

export const TR_SUBMIT = `mutation SubmitTransfer($id: uuid!) { submit_transfer_request(request_id: $id) { status } }`;
export const TR_CANCEL = `mutation CancelTransfer($id: uuid!, $reason: String!) { cancel_transfer_request(request_id: $id, reason: $reason) { status } }`;
export const TR_CHOOSE = `
  mutation ChooseTransferPosition($id: uuid!, $position: uuid!) {
    choose_transfer_position(request_id: $id, position_id: $position) { status }
  }
`;

export const TR_MY_TASK_FOR = `
  query MyTransferTask($id: uuid!) { wf_v_inbox(where: {entity_id: {_eq: $id}}) { task_id via_delegation } }
`;

// ---- Điều chuyển liên tập đoàn ----

export const TRO_LIST = gql`
  query CrossTransfers(
    $limit: Int
    $offset: Int
    $order_by: [hr_transfer_out_order_by!]
    $where: hr_transfer_out_bool_exp
  ) {
    hr_transfer_out(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      doc_no
      status
      stage
      person_name
      target_unit_name
      effective_date
      created_at
      requester {
        full_name
      }
    }
    hr_transfer_out_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const TRO_DETAIL = `
  query CrossTransfer($id: uuid!) {
    hr_transfer_out_by_pk(id: $id) {
      id doc_no status stage approval_round created_at updated_at effective_date reason requester_kind
      requester_id person_id person_name source_position_id target_tenant_id target_unit_name
      requester { full_name }
      requester_position { name org_unit { name } }
      source_position { name org_unit { name } }
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
    }
  }
`;

export const TRI_DETAIL = `
  query CrossIn($id: uuid!) {
    hr_transfer_in_by_pk(id: $id) {
      id doc_no status approval_round effective_date person_name target_unit_id target_position_id
      target_unit { name }
      target_position { name }
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
    }
  }
`;

export const TRG_DETAIL = `
  query CrossGroup($id: uuid!) {
    hr_transfer_group_by_pk(id: $id) {
      id doc_no status approval_round effective_date person_name
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
    }
  }
`;

export const TR_TENANTS = `query TransferTenants { transfer_tenants { tenants } }`;
export const TR_TENANT_UNITS = `
  query TransferTenantUnits($tenant: uuid!) { transfer_target_units(tenant_id: $tenant) { units } }
`;

export const TRO_CREATE = `
  mutation CreateCrossTransfer($person: uuid!, $source: uuid!, $tenant: uuid!, $unit: uuid!, $effective: date!, $reason: String!) {
    create_transfer_out(person_id: $person, source_position_id: $source, target_tenant_id: $tenant,
                        target_unit_id: $unit, effective_date: $effective, reason: $reason) { request_id status }
  }
`;
export const TRO_SUBMIT = `mutation SubmitCrossTransfer($id: uuid!) { submit_transfer_out(request_id: $id) { status } }`;
export const TRO_CANCEL = `mutation CancelCrossTransfer($id: uuid!, $reason: String!) { cancel_transfer_out(request_id: $id, reason: $reason) { status } }`;
export const TRI_CHOOSE = `
  mutation ChooseCrossPosition($id: uuid!, $position: uuid!) {
    choose_transfer_in_position(request_id: $id, position_id: $position) { status }
  }
`;
