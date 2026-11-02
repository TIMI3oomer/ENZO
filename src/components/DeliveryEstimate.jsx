import { useTranslation } from "react-i18next";
import { Truck } from "lucide-react";
import { useContent } from "../hooks/useContent.js";

// "Delivery in 1-3 days" -- shown on the product page, checkout, order
// confirmation and tracking. The number of days is editable in the CMS
// (Site content -> Store info -> site.store.deliveryDays).
export default function DeliveryEstimate({ className = "" }) {
  const { t } = useTranslation("common");
  const days = useContent("site").store?.deliveryDays || "1-3";
  return (
    <p className={`flex items-center gap-2 text-sm text-enzo-muted ${className}`}>
      <Truck size={16} className="flex-none text-enzo-goldBright" />
      <span>
        {t("delivery.estimate")} <span className="font-semibold text-enzo-white" dir="ltr">{days}</span> {t("delivery.days")}
      </span>
    </p>
  );
}
