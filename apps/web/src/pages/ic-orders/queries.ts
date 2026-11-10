import gql from "graphql-tag";

export const IC_LIST = gql`
  query IcOrders($limit: Int, $offset: Int, $order_by: [ic_ic_order_order_by!], $where: ic_ic_order_bool_exp) {
    ic_ic_order(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      doc_no
      status
      total_amount
      created_at
      can_confirm
      seller_unit {
        name
      }
      buyer_unit {
        name
      }
      created_by_person {
        full_name
      }
    }
    ic_ic_order_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const IC_DETAIL = `
  query IcOrder($id: uuid!) {
    ic_ic_order_by_pk(id: $id) {
      id doc_no status total_amount created_at decided_at decision_note created_by can_confirm
      seller_unit { name path }
      buyer_unit { name }
      created_by_person { full_name }
      decided_by_person { full_name }
      purchase_requests { id doc_no title }
      purchase_orders { id doc_no status purchase_order_items(order_by: {line_no: asc}) { line_no lot { lot_no } } }
      ic_order_items(order_by: {line_no: asc}) {
        id line_no item_id description uom quantity unit_price amount
        item { code }
        lot { lot_no produced_on }
      }
      comments(order_by: {created_at: asc}) { id body created_at edited_at deleted_at parent_id author_id author { full_name } }
    }
  }
`;

export const SELLER_LOTS = `
  query SellerLots($items: [uuid!]!, $seller: ltree!) {
    mfg_lot(where: {item_id: {_in: $items}, status: {_eq: "RELEASED"}, org_unit: {path: {_descendant: $seller}}},
            order_by: {produced_on: asc}) {
      id lot_no item_id quantity uom produced_on org_unit { name }
    }
  }
`;

export const CONFIRM_IC = `
  mutation ConfirmIc($id: uuid!, $lots: [IcOrderLot!]) {
    confirm_ic_order(order_id: $id, lots: $lots) { status }
  }
`;
export const REJECT_IC = `mutation RejectIc($id: uuid!, $reason: String!) { reject_ic_order(order_id: $id, reason: $reason) { status } }`;
export const CANCEL_IC = `mutation CancelIc($id: uuid!, $reason: String!) { cancel_ic_order(order_id: $id, reason: $reason) { status } }`;
