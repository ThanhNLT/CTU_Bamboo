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

import gql from "graphql-tag";

export const PR_LIST = gql`
  query PurchaseRequests(
    $limit: Int
    $offset: Int
    $order_by: [proc_purchase_request_order_by!]
    $where: proc_purchase_request_bool_exp
  ) {
    proc_purchase_request(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      doc_no
      title
      status
      total_amount
      created_at
      updated_at
      requester {
        full_name
      }
      org_unit {
        name
      }
    }
    proc_purchase_request_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const PR_DETAIL = `
  query PurchaseRequest($id: uuid!) {
    proc_purchase_request_by_pk(id: $id) {
      id doc_no title description status total_amount category_code needed_by approval_round created_at updated_at
      requester_id requester_position_id partner_id proposed_partner_name proposed_partner_tax_code
      requester { full_name }
      requester_position { name }
      org_unit { name }
      partner { code name internal_unit_id }
      ic_order { id doc_no status }
      purchase_request_items(order_by: {line_no: asc}) { id line_no item_id description uom quantity unit_price amount note item { code } }
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
      comments(order_by: {created_at: asc}) { id body created_at edited_at deleted_at parent_id author_id author { full_name } }
      attachments(order_by: {created_at: asc}) { id file_name content_type size_bytes status scan_result scan_engines created_at uploaded_by uploaded_by_person { full_name } ocr { status pages_total pages_done note error } }
    }
  }
`;

export const MY_TASK_FOR = `
  query MyTaskFor($id: uuid!) {
    wf_v_inbox(where: {entity_id: {_eq: $id}}) { task_id via_delegation }
  }
`;

export const FORM_OPTIONS = `
  query FormOptions($person: uuid!) {
    core_assignment(where: {person_id: {_eq: $person}, assignment_type: {_in: ["PRIMARY", "CONCURRENT", "ACTING", "CONTRACT"]}}) {
      position_id assignment_type valid_period position { name org_unit { name } }
    }
    mdm_partner(where: {is_active: {_eq: true}}, order_by: {name: asc}) { id code name internal_unit_id }
    mdm_item(where: {is_active: {_eq: true}}, order_by: {code: asc}) { id code name uom category_code ref_price }
    core_catalog_item(where: {catalog: {_eq: "ITEM_CATEGORY"}}, order_by: {name: asc}) { code name }
    core_v_permission_grant(where: {permission_code: {_eq: "mdm.manage"}}, limit: 1) { permission_code }
  }
`;

export const INSERT_PR = `
  mutation CreatePurchaseRequest($object: proc_purchase_request_insert_input!) {
    insert_proc_purchase_request_one(object: $object) { id }
  }
`;

export const UPDATE_PR = `
  mutation UpdatePurchaseRequest($id: uuid!, $set: proc_purchase_request_set_input!, $items: [proc_purchase_request_item_insert_input!]!) {
    delete_proc_purchase_request_item(where: {request_id: {_eq: $id}}) { affected_rows }
    insert_proc_purchase_request_item(objects: $items) { affected_rows }
    update_proc_purchase_request_by_pk(pk_columns: {id: $id}, _set: $set) { id }
  }
`;

export const SUBMIT_PR = `mutation Submit($id: uuid!) { submit_purchase_request(request_id: $id) { status } }`;
export const CANCEL_PR = `mutation Cancel($id: uuid!, $reason: String!) { cancel_purchase_request(request_id: $id, reason: $reason) { status } }`;
export const PR_PDF = `
  query PurchaseRequestPdf($id: uuid!) { get_purchase_request_pdf(request_id: $id) { url file_name check_code } }
`;
export const ACT_ON_TASK = `
  mutation Act($task: uuid!, $decision: ApprovalDecision!, $note: String) {
    act_on_task(task_id: $task, decision: $decision, note: $note) { status }
  }
`;
