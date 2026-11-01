import { useTranslation } from "react-i18next";
import { Truck, ShieldCheck, Banknote, Award } from "lucide-react";
import Reveal from "./Reveal.jsx";

// CHECKPOINT NOTE (components/TrustBadges.jsx):
// A quick horizontal strip of reassurance points, sitting between the
// hero and the product grid in Home.jsx -- adds visual rhythm and a
// little more "premium store" credibility without competing with either
// section for attention. Each icon now sits in a soft gold circle (a
// small, common mobile pattern -- reads cleanly at a glance while
// scrolling on a phone) and the row rises in with a light stagger instead
// of popping in all at once.
const BADGES = [
  { icon: Truck, key: "fastDelivery" },
  { icon: ShieldCheck, key: "securePayment" },
  { icon: Banknote, key: "cashOnDelivery" },
  { icon: Award, key: "qualityChecked" },
];

export default function TrustBadges() {
  const { t } = useTranslation("common");

  return (
    <section className="border-y hairline bg-enzo-panel/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6">
        {BADGES.map(({ icon: Icon, key }, i) => (
          <Reveal key={key} delay={i * 0.06} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-start">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-enzo-gold/10">
              <Icon size={19} className="text-enzo-goldBright" />
            </span>
            <span className="text-sm text-enzo-muted">{t(`trust.${key}`)}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
