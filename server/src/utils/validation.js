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

export const createOrderSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
  city: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(1000).optional().nullable(),
  paymentMethod: z.enum(["cod", "visa", "reflect"]),
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
  stock: z.number().int().nonnegative(),
  category_id: z.string().uuid().nullable().optional(),
  sizes: z.array(z.string().max(10)).default([]),
  colors: z.array(z.string().max(30)).default([]),
  color_images: z.record(z.string().url()).optional().default({}),
  images: z.array(z.string().url()).default([]),
  is_active: z.boolean().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
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

export const settingsSchema = z.object({
  delivery_fee: z.number().nonnegative(),
  currency_symbol: z.string().trim().min(1).max(10).optional(),
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
