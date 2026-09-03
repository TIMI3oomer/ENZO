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
//
// IPHONE/IOS SUPPORT: iPhones save camera photos as HEIC/HEIF by default.
// Two separate problems with that format, not just one:
//   (a) it wasn't in the allowed MIME list, so uploads were rejected
//       outright, and
//   (b) even if allowed, HEIC can't be DISPLAYED by most browsers other
//       than Safari — a customer on Chrome/Android/Windows would just see
//       a broken image icon where the product photo should be.
// So HEIC/HEIF files are converted to a real JPEG right here in the
// browser (via heic2any, a WASM-based decoder) BEFORE any of the checks
// below run. The stored file is always a genuine, universally-viewable
// JPEG regardless of what device/format the admin's photo came from —
// this isn't a workaround, it's the correct fix.
const BUCKET = "product-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — must match schema.sql's file_size_limit
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

  const isRiff = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
  const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  return isRiff && isWebp;
}

function isHeic(file) {
  // Some iOS/Safari versions report an empty file.type for HEIC photos
  // picked straight from the camera roll, so the extension is checked too.
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicToJpeg(file) {
  // Dynamically imported: most visitors never touch this code path (only
  // relevant on the admin's upload form), so there's no reason to ship
  // this WASM-based library in the main app bundle for everyone.
  const heic2any = (await import("heic2any")).default;

  let convertedBlob;
  try {
    convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  } catch {
    throw new Error(`"${file.name}" is an iPhone photo format (HEIC) that couldn't be converted automatically. Try re-saving it as JPEG first.`);
  }

  // heic2any can occasionally return an array (multi-image HEIC); we only
  // handle the standard single-image case here, which covers normal
  // camera photos.
  const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

export async function uploadProductImage(originalFile) {
  const file = isHeic(originalFile) ? await convertHeicToJpeg(originalFile) : originalFile;

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
