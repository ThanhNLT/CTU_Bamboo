// SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
//
// SPDX-License-Identifier: Apache-2.0

// Truy vấn GraphQL cho đề nghị tiếp nhận nhân sự (docs/thiet-ke/08-api-giao-dien.md, ADR #41).
import gql from "graphql-tag";

export const OB_LIST = gql`
  query Onboardings($limit: Int, $offset: Int, $order_by: [hr_onboarding_request_order_by!], $where: hr_onboarding_request_bool_exp) {
    hr_onboarding_request(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id doc_no full_name status account_status start_date created_at
      requester { full_name }
      target_position { name org_unit { name } }
    }
    hr_onboarding_request_aggregate(where: $where) { aggregate { count } }
  }
`;

export const OB_DETAIL = `
  query Onboarding($id: uuid!) {
    hr_onboarding_request_by_pk(id: $id) {
      id doc_no status approval_round created_at updated_at requester_id requester_position_id
      full_name gender date_of_birth work_email phone education major
      target_position_id start_date contract_type salary note bank_name username
      national_id_masked bank_account_masked address_masked
      account_status account_error person_id can_read_private
      requester { full_name }
      requester_position { name }
      org_unit { name }
      target_position { name org_unit { name } }
      person { employee_code }
      approval_steps(order_by: [{round: desc}, {step_order: asc}]) {
        id round step_order status acted_at note
        position { name org_unit { name } }
        acted_by_person { full_name }
        on_behalf_of_person { full_name }
        tasks(where: {status: {_eq: "OPEN"}}) { id assignee_id escalated escalation_reason }
      }
      approval_history(order_by: {id: asc}) { id event detail created_at person { full_name } on_behalf_of_person { full_name } }
      comments(order_by: {created_at: asc}) { id body created_at edited_at deleted_at parent_id author_id author { full_name } }
      attachments(order_by: {created_at: asc}) { id file_name content_type size_bytes status scan_result created_at uploaded_by uploaded_by_person { full_name } }
    }
  }
`;

// Tư cách lập, quyền lập (phạm vi), cây đơn vị và ghế để chọn vị trí còn trống.
export const OB_OPTIONS = `
  query OnboardingOptions($person: uuid!) {
    core_assignment(where: {person_id: {_eq: $person}, assignment_type: {_in: ["PRIMARY", "CONCURRENT", "ACTING"]}}) {
      position_id assignment_type position { name org_unit { name } }
    }
    core_v_permission_grant(where: {permission_code: {_eq: "hr.onboarding.create"}}) { scope anchor_unit_id }
    core_org_unit(order_by: {path: asc}) { id name path }
    core_position(order_by: {name: asc}) {
      id name is_head org_unit_id valid_period
      assignments { valid_period }
    }
  }
`;

export const OB_INSERT = `
  mutation CreateOnboarding($object: hr_onboarding_request_insert_input!) {
    insert_hr_onboarding_request_one(object: $object) { id }
  }
`;

export const OB_UPDATE = `
  mutation UpdateOnboarding($id: uuid!, $set: hr_onboarding_request_set_input!) {
    update_hr_onboarding_request_by_pk(pk_columns: {id: $id}, _set: $set) { id }
  }
`;

export const OB_SAVE_PRIVATE = `
  mutation SavePrivate($id: uuid!, $national_id: String, $bank_account: String, $bank_name: String, $address: String) {
    save_onboarding_private(request_id: $id, national_id: $national_id, bank_account: $bank_account,
                            bank_name: $bank_name, address: $address) { status }
  }
`;

export const OB_REVEAL = `
  mutation Reveal($id: uuid!) {
    reveal_onboarding_private(request_id: $id) { national_id bank_account address username initial_password }
  }
`;

export const OB_SUBMIT = `mutation SubmitOnboarding($id: uuid!) { submit_onboarding_request(request_id: $id) { status } }`;
export const OB_CANCEL = `mutation CancelOnboarding($id: uuid!, $reason: String!) { cancel_onboarding_request(request_id: $id, reason: $reason) { status } }`;
export const OB_RETRY = `mutation RetryAccount($id: uuid!, $username: String) { retry_onboarding_account(request_id: $id, username: $username) { account_status } }`;
export const MY_TASK_FOR = `
  query MyTaskFor($id: uuid!) { wf_v_inbox(where: {entity_id: {_eq: $id}}) { task_id via_delegation } }
`;
