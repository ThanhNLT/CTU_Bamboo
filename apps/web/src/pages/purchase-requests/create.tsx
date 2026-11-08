import { Create } from "@refinedev/antd";
import { useGo } from "@refinedev/core";

import { PurchaseRequestForm } from "./form";
import { tr } from "../../i18n";

export const PurchaseRequestCreate = () => {
  const go = useGo();
  return (
    <Create title={tr("Lập đề nghị mua sắm")} footerButtons={() => null}>
      <PurchaseRequestForm onSaved={(id) => go({ to: { resource: "proc_purchase_request", action: "show", id } })} />
    </Create>
  );
};
