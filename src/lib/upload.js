import { supabase } from "./supabaseClient.js";

// CHECKPOINT NOTE (src/lib/upload.js):
// THREE independent layers of defense against a malicious/disguised file
// upload, since a determined attacker can bypass any single one:
//
// 1. MIME type check (below) — fast, but the browser-reported file.type
//    can be spoofed/forged, so this alone is NOT enough.
// 2. Magic-byte ("file signature") check (isGenuineImage) — reads the
//    first few real bytes of the file and confirms they match a known
//    image format's actual binary signature. This catches something like
//    "malware.exe" renamed to "totally-a-shirt.jpg" — renaming a file
//    doesn't change its actual byte content, so the fake would fail here
//    even though its extension/MIME type look fine.
// 3. Storage-level enforcement (see supabase/schema.sql's bucket
//    definition: file_size_limit + allowed_mime_types) — THIS is the one
//    that actually can't be bypassed, because it's enforced by Supabase
//    itself regardless of what the browser sends. Layers 1-2 exist purely
//    to give the admin a fast, friendly error instead of a raw API
//    rejection — they are NOT the security boundary, the bucket
//    configuration is.
//
// This uploads directly from the browser to Supabase Storage using the
// admin's own logged-in session. The "admin upload product images"
// policy on storage.objects (see schema.sql) also checks is_admin()
// server-side before allowing the write, on top of all of the above.
const BUCKET = "product-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — must match schema.sql's file_size_limit
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Known first-bytes ("magic numbers") for each allowed image format.
const SIGNATURES = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

function readHeaderBytes(file, length) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

async function isGenuineImage(file) {
  const header = await readHeaderBytes(file, 12);

  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => header[i] === b)) return true;
  }

  // WEBP has a slightly different layout: "RIFF" at bytes 0-3, then
  // "WEBP" at bytes 8-11 (bytes 4-7 are a file-size field, not fixed).
  const isRiff = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
  const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  return isRiff && isWebp;
}

export async function uploadProductImage(file) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`"${file.name}" isn't a supported image type — use JPG, PNG, WEBP, or GIF.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`"${file.name}" is larger than 5MB.`);
  }

  const genuine = await isGenuineImage(file);
  if (!genuine) {
    throw new Error(`"${file.name}" doesn't look like a real image file and was rejected.`);
  }

  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
