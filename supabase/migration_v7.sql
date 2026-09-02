-- =====================================================================
-- ENZO STORE — MIGRATION 7
-- File: /supabase/migration_v7.sql
-- Run this AFTER migration_v6.sql.
--
-- CHECKPOINT NOTE — WHY THIS EXISTS
-- src/lib/upload.js already checks file type/size/signature in the
-- browser, but client-side JS can always be bypassed by a determined
-- attacker (editing the JS, or calling Supabase's upload API directly
-- with any tool). THIS is the check that actually can't be bypassed:
-- Supabase Storage itself will refuse the upload if it doesn't match
-- these settings, no matter how the request was made.
-- =====================================================================

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB, matches MAX_SIZE_BYTES in src/lib/upload.js
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'product-images';
