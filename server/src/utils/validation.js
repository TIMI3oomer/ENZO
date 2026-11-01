import { z } from "zod";

// CHECKPOINT NOTE (server/src/utils/validation.js):
// Every write endpoint validates its body against one of these schemas
// BEFORE touching the database. This is the backend's own line of
// defense — independent from both the frontend's form validation and the
// database's CHECK constraints (schema.sql). Three layers, none of which
// trust each other.
export const localizedText = z.object({
  ar: z.string().trim().default(""),
  en: z.string().trim().default(""),
});

export const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  size: z.string().max(20).nullable().optional(),
  color: z.string().max(30).nullable().optional(),
  quantity: z.number().int().positive().max(50),
});

// Where the customer is, for delivery pricing. The fee itself is NOT sent
// by the client -- it's computed in the database from this value (see
// delivery_fee_for_region() in supabase/schema.sql).
export const DELIVERY_REGIONS = ["west_bank", "jerusalem", "inside"];

export const createOrderSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
  city: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(1000).optional().nullable(),
  paymentMethod: z.enum(["cod", "visa", "reflect"]),
  deliveryRegion: z.enum(DELIVERY_REGIONS, {
    errorMap: () => ({ message: "Please choose your delivery region" }),
  }),
  locale: z.enum(["ar", "en"]).default("ar"),
  items: z.array(orderItemSchema).min(1).max(50),
});

export const productSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  name: localizedText,
  description: localizedText.optional(),
  material: localizedText.optional(),
  fit: localizedText.optional(),
  care_instructions: localizedText.optional(),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  category_id: z.string().uuid().nullable().optional(),
  sizes: z.array(z.string().max(10)).default([]),
  colors: z.array(z.string().max(30)).default([]),
  color_images: z.record(z.string().url()).optional().default({}),
  images: z.array(z.string().url()).default([]),
  is_active: z.boolean().optional(),
  sold_out_sizes: z.array(z.string().max(10)).default([]),
  sold_out_colors: z.array(z.string().max(30)).default([]),
  discount_percent: z.number().min(0).max(100).default(0),
  // Per size+color stock ("<color>__<size>" -> quantity). Empty object =
  // this product doesn't use the grid yet (see src/lib/variantStock.js
  // for the exact two-state rule this mirrors).
  variant_stock: z.record(z.number().int().nonnegative()).optional().default({}),
});

export const orderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

// Used by the admin to mark a manual-transfer (Reflect) or cash order as
// paid once the money has actually arrived.
export const paymentStatusSchema = z.object({
  payment_status: z.enum(["pending", "paid", "failed", "refunded"]),
});

// A walk-in sale the admin rings up in person (see
// POST /api/admin/in-store-sales / record_in_store_sale() in schema.sql).
export const inStoreSaleSchema = z.object({
  customerName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z.array(orderItemSchema).min(1).max(50),
});

export const refundSchema = z.object({
  note: z.string().trim().max(1000).optional().nullable(),
});

export const categorySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  name: localizedText,
});

// Delivery cost is normally computed from the region (see
// createOrderSchema above / delivery_fee_for_region() in schema.sql);
// this is only for the admin's manual override of a specific order's fee.
export const deliveryFeeSchema = z.object({
  delivery_fee: z.number().nonnegative(),
});

// Manifest-driven CMS (content_items / content_collections, see
// supabase/schema.sql). One page's worth of scalars + ordered collection
// sections is saved together from the dashboard editor in a single PUT,
// so this validates the whole payload at once.
export const contentItemSchema = z.object({
  section: z.string().trim().min(1).max(100),
  key: z.string().trim().min(1).max(100),
  value: z.string().max(5000).nullable().optional(),
});

export const contentCollectionItemSchema = z.object({
  section: z.string().trim().min(1).max(100),
  sort_order: z.number().int().nonnegative().optional(),
  data: z.record(z.any()),
});

export const contentPageSchema = z.object({
  items: z.array(contentItemSchema).max(200).default([]),
  collections: z.array(contentCollectionItemSchema).max(200).default([]),
});

// Small helper used by every route: validates `req.body` against a zod
// schema and throws a clean 400 error (caught by errorHandler.js) if it
// doesn't match, instead of letting a malformed request reach Supabase.
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return result.data;
}
