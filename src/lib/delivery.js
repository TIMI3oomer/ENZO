// CHECKPOINT NOTE (src/lib/delivery.js):
// Delivery regions shown in the checkout dropdown. These fees are for
// DISPLAY ONLY -- the backend never accepts a fee from the browser. The
// real amount is computed in the database by delivery_fee_for_region()
// (supabase/schema.sql), which is the single source of truth. If you
// change a price, change it there AND here so the customer sees the same
// number they're charged.
export const DELIVERY_REGIONS = [
  { id: "west_bank", fee: 20, label: { ar: "الضفة الغربية", en: "West Bank" } },
  { id: "jerusalem", fee: 30, label: { ar: "القدس", en: "Jerusalem" } },
  { id: "inside", fee: 70, label: { ar: "الداخل", en: "Inside (48 areas)" } },
];

export function getDeliveryRegion(id) {
  return DELIVERY_REGIONS.find((r) => r.id === id) || null;
}
