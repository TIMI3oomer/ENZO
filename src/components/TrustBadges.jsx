import { useTranslation } from "react-i18next";
import { Truck, ShieldCheck, RotateCcw, Award } from "lucide-react";

// CHECKPOINT NOTE (components/TrustBadges.jsx):
// A quick horizontal strip of reassurance points, sitting between the
// hero and the product grid in Home.jsx -- adds visual rhythm and a
// little more "premium store" credibility without competing with either
// section for attention.
const BADGES = [
  { icon: Truck, key: "fastDelivery" },
  { icon: ShieldCheck, key: "securePayment" },
  { icon: RotateCcw, key: "easyReturns" },
  { icon: Award, key: "qualityChecked" },
];

export default function TrustBadges() {
  const { t } = useTranslation("common");

  return (
    <section className="border-y hairline bg-enzo-panel/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
        {BADGES.map(({ icon: Icon, key }) => (
          <div key={key} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-start">
            <Icon size={22} className="text-enzo-goldBright" />
            <span className="text-sm text-enzo-muted">{t(`trust.${key}`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
