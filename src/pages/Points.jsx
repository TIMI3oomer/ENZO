import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Coins, ShoppingBag, Gift, RotateCcw, Store } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { formatPrice } from "../lib/formatPrice.js";

// CHECKPOINT NOTE (Points.jsx):
// /points -- explains the loyalty points (the rules themselves live in the
// database: points_for_amount / place_order in migration_v16.sql) and, for
// a signed-in customer, shows their balance and recent movements
// (GET /api/account/points).
export default function Points() {
  const { t } = useTranslation("common");
  const { session } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!session) return;
    api.get("/account/points").then(setData).catch(() => setData(null));
  }, [session]);

  const steps = [
    { icon: ShoppingBag, title: t("points.howEarnTitle"), text: t("points.howEarn") },
    { icon: Gift, title: t("points.howUseTitle"), text: t("points.howUse") },
    { icon: RotateCcw, title: t("points.cancelTitle"), text: t("points.cancel") },
    { icon: Store, title: t("points.inStoreTitle"), text: t("points.inStore") },
  ];

  // examples are for full-price items (sale items don't earn points)
  const examples = [100, 250, 480].map((amount) => {
    const points = amount >= 100 ? Math.floor(amount / 100) * 500 : 0;
    return { amount, points };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-start sm:px-6">
      <span className="mb-3 block h-[3px] w-10 bg-enzo-gradient" />
      <h1 className="font-display text-4xl uppercase">{t("points.title")}</h1>
      <p className="mt-3 max-w-xl text-enzo-muted">{t("points.intro")}</p>

      {session ? (
        data && (
          <div className="mt-8 flex items-center gap-4 rounded-xl border border-enzo-gold/40 bg-[radial-gradient(circle_at_20%_0%,rgba(201,162,39,0.25),transparent_60%)] p-6">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-enzo-gradient text-enzo-black">
              <Coins size={26} />
            </span>
            <div>
              <p className="text-sm text-enzo-muted">{t("points.yourBalance")}</p>
              <p className="font-display text-3xl">
                {data.balance.toLocaleString()} <span className="text-base text-enzo-muted">{t("points.pts")}</span>
              </p>
              <p className="text-sm text-enzo-goldBright">= {formatPrice(Math.max(data.balance, 0) / 100)}</p>
            </div>
          </div>
        )
      ) : (
        <p className="mt-8 rounded-lg border hairline p-4 text-sm text-enzo-muted">
          <Link to="/login" state={{ from: "/points" }} className="text-enzo-gold underline">
            {t("auth.signIn")}
          </Link>{" "}
          {t("points.signInToCollect")}
        </p>
      )}

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border hairline bg-enzo-panel/50 p-5">
            <Icon size={22} className="text-enzo-goldBright" />
            <p className="mt-3 font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-enzo-muted">{text}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 font-display text-xl uppercase">{t("points.examplesTitle")}</h2>
      <div className="mt-4 overflow-hidden rounded-lg border hairline">
        <table className="w-full text-sm">
          <thead className="bg-enzo-panel text-enzo-muted">
            <tr>
              <th className="px-4 py-2 text-start">{t("points.orderOf")}</th>
              <th className="px-4 py-2 text-start">{t("points.youGet")}</th>
              <th className="px-4 py-2 text-start">{t("points.worth")}</th>
            </tr>
          </thead>
          <tbody>
            {examples.map(({ amount, points }) => (
              <tr key={amount} className="border-t hairline">
                <td className="px-4 py-2">{formatPrice(amount)}</td>
                <td className="px-4 py-2 font-semibold text-enzo-goldBright">{points.toLocaleString()} {t("points.pts")}</td>
                <td className="px-4 py-2">{formatPrice(points / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-enzo-muted">{t("points.rateNote")}</p>

      {data?.history?.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl uppercase">{t("points.historyTitle")}</h2>
          <ul className="mt-4 flex flex-col divide-y divide-enzo-line rounded-lg border hairline">
            {data.history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p>{t(`points.reason_${h.reason}`)}</p>
                  <p className="text-xs text-enzo-muted">
                    {h.orders?.order_number && `#${h.orders.order_number} · `}
                    {new Date(h.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`font-semibold ${h.delta > 0 ? "text-enzo-goldBright" : "text-enzo-error"}`} dir="ltr">
                  {h.delta > 0 ? "+" : ""}
                  {h.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
