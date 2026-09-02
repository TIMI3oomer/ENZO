# ENZO — Bilingual Arabic-first Store

React + Vite + Tailwind (frontend) + Node/Express (backend) + Supabase
(database + auth). Arabic is the default language and drives real RTL
layout (not a translated LTR skin) — see the checkpoints below for
exactly what implements each requirement.

## 1. Setup

This project now has TWO things to run: the Node backend and the React
frontend. Use two terminal windows/tabs.

**Database (once):**
As of this update, everything lives in ONE file — no more running
migrations in sequence.

- **Fresh setup:** just run `supabase/schema.sql` in the Supabase SQL editor.
- **Already have an ENZO database from before:** run `supabase/00_reset.sql`
  first (⚠️ this deletes all products/orders/customers — see the warning
  in that file), then run `supabase/schema.sql`. Your Supabase Auth
  logins (admin + customer accounts) are untouched by this, but you will
  need to re-insert your admin into the `admin_users` table afterward
  since that table gets dropped and recreated.

**Backend (`/server`):**
```bash
cd server
npm install
cp .env.example .env      # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run dev                # starts on http://localhost:4000
```

**Frontend (project root):**
```bash
npm install
cp .env.example .env      # fill in Supabase URL + ANON key + VITE_API_URL
npm run dev                # starts on http://localhost:5173
```

To create the store owner's admin login:
1. Supabase Dashboard → Authentication → Users → Add user (email + password).
2. Supabase Dashboard → Table editor → `admin_users` → insert a row with
   that user's `id` as `user_id`.
3. Go to `/admin/login` on the site and sign in.

## 2. Project structure

```
src/                        -> React frontend
  lib/api.js                -> talks to the Node backend (all product/order/admin data)
  lib/supabaseClient.js     -> Supabase client used ONLY for Auth now
  context/                  -> Language, Cart, Auth
  pages/ , pages/admin/     -> storefront + admin screens

server/                     -> Node/Express backend (NEW)
  src/index.js              -> app entry: helmet, cors, rate limiting
  src/lib/supabaseAdmin.js  -> the ONLY place the service_role key is used
  src/middleware/auth.js    -> verifies Supabase tokens, admin gate
  src/routes/               -> products, categories, orders, admin
  src/utils/validation.js   -> zod schemas, validated before every write

supabase/
  schema.sql                -> the entire database: tables, RLS, functions, seed data
  00_reset.sql              -> drops everything, for a clean re-run of schema.sql
```

## 3. Checkpoints (what was built, and why)

**Checkpoint 1 — Project scaffold & tooling**
Vite + React + Tailwind + postcss-logical configured so RTL/LTR use real
CSS logical properties (`margin-inline`, `inset-inline`, `text-align:
start/end`) instead of hardcoded left/right. File: `tailwind.config.js`,
`postcss.config.js`.

**Checkpoint 2 — Language & direction engine**
`src/context/LanguageContext.jsx` is the single place that decides the
active language, persists it, and flips `<html lang dir>` — this is what
makes the *entire* layout mirror, not just the text. Default is Arabic
unless `localStorage.enzo_lang` says otherwise (requirement #1).

**Checkpoint 3 — Translation system**
`src/i18n/` holds `common.json` / `checkout.json` / `admin.json` per
language. No interface text is hardcoded inside components — everything
goes through `t("...")`.

**Checkpoint 4 — Bilingual product/category data model**
`supabase/schema.sql` stores `name`, `description`, `material`, `fit`,
`care_instructions` as `jsonb` columns shaped like `{ "ar": "...", "en": "..." }`
on a single `products` row — never duplicate products per language.

**Checkpoint 5 — Language switcher + persistence**
`src/components/LanguageSwitcher.jsx` renders "العربية | English".
Switching language never touches the router or the cart.

**Checkpoint 6 — Storefront pages**
Home, Shop (category + size filters + sort), Product detail, Cart,
Checkout, Order confirmation. All built with logical CSS properties.

**Checkpoint 7 — Admin dashboard**
`src/pages/admin/*` + `AdminLayout.jsx` give the store owner a fully
bilingual dashboard — never forced into English.

**Checkpoint 8 — Database security (Row Level Security)**
`supabase/schema.sql` enables RLS on every table as a defense-in-depth
layer, in addition to the backend's own checks (Checkpoint 13).

**Checkpoint 9 — Visual identity**
Black base (#0A0A0A), off-white text, a pink→orange gradient (from the
Instagram profile ring) reused as a recurring hover/focus signature.
Fonts: Anton (EN display) + Inter (EN body) + IBM Plex Sans Arabic (all
Arabic text).

**Checkpoint 10 — Pants + Trainings categories**
`supabase/migration_v2.sql` adds `pants` ("بناطيل") and `training`
("ترينج"). Category tabs on Shop pull live from the database, so no
frontend change was needed for the tabs themselves.

**Checkpoint 11 — Real filters on the Shop page**
Sort (newest / price low-high / price high-low) + size filter, now
resolved server-side by the backend (`GET /api/products?category=&size=&sort=`).

**Checkpoint 12 — Customer login / register / accounts**
`src/pages/Login.jsx`, `Register.jsx`, `Account.jsx`. Guest checkout still
fully works — logging in is optional and just links the order to the
account for order-history purposes.

**Checkpoint 13 — Node.js backend (NEW)**
This is the big structural change. Previously the React app talked to
Supabase directly with the public anon key, which meant:
- A customer could edit the order total in devtools before it was saved.
- Two people buying the last unit of a product at the same time could
  both "succeed," overselling stock.
- All write security depended entirely on Row Level Security policies,
  with no independent server-side validation layer.

Now:
- `server/` is a proper Express API. It's the only thing with the
  Supabase **service_role** key (`server/src/lib/supabaseAdmin.js`) —
  that key is never in the frontend, ever.
- `POST /api/orders` (`server/src/routes/orders.js`) accepts only
  product ids/sizes/quantities. It calls `place_order()`
  (`supabase/migration_v3.sql`), a Postgres function that looks up real
  prices, locks stock rows, checks availability, and creates the order +
  line items + stock decrement in one atomic transaction. There is no
  code path left where the client controls a price.
- Every admin write (`server/src/routes/admin.js`) requires a verified
  Supabase access token AND a row in `admin_users` (`requireAdmin`
  middleware), checked fresh on every request.
- `server/src/utils/validation.js` validates every request body with zod
  before it touches the database — a third, independent layer alongside
  the frontend's form validation and the database's CHECK constraints.
- `helmet`, `cors` (locked to your frontend's origin), a request size
  limit, and rate limiting on order creation are all in
  `server/src/index.js`.
- The frontend now calls this backend via `src/lib/api.js` for every
  product/order/admin operation. `supabaseClient.js` is kept only for
  Supabase Auth (login/register/session).

**Checkpoint 14 — Customer profiles + admin Customers page**
Supabase Auth's built-in `auth.users` table only holds login credentials
(email, password) and isn't meant to be extended directly. `supabase/migration_v4.sql`
adds a standard companion `profiles` table (phone, saved city/address),
linked 1-to-1 to `auth.users` and auto-created on signup via a Postgres
trigger. This is what backs:
- `src/pages/Account.jsx` — customers can now view and edit their own
  phone/address (`GET`/`PUT /api/account/profile`, enforced to their own
  row only via the verified token's user id, same pattern as `/orders/mine`).
- `src/pages/admin/Customers.jsx` — a new admin page merging Supabase
  Auth's user list with `profiles` and an order count per customer
  (`GET /api/admin/customers`), reachable from the sidebar.

**Checkpoint 15 — Black / white / gold palette + smoother language switch**
- `tailwind.config.js` replaced the pink/orange accent with a gold system
  (`enzo.gold`, `enzo.goldLight`, `enzo.goldDark`). Every CTA button
  already used the shared `bg-enzo-gradient` class, so they all updated
  from one config change. A separate `enzo.error` red was kept — on
  purpose — for delete buttons and validation messages only; that's a
  semantic/accessibility color, not part of the decorative brand palette,
  so it wasn't converted to gold.
- `src/context/LanguageContext.jsx` now wraps the ar↔en switch in the
  browser's View Transition API (`document.startViewTransition`, with
  `flushSync` forcing the DOM update to happen inside it), so the whole
  page cross-fades between RTL and LTR instead of snapping instantly.
  `src/index.css` defines the actual fade/scale timing
  (`::view-transition-old/new`). Browsers without support (e.g. Firefox)
  or people with "reduce motion" turned on automatically get an instant,
  unanimated switch instead — never a broken one.
- Audited every component for hardcoded `left-`/`right-`/`ml-`/`mr-`
  classes that would misalign under RTL; none were found outside of code
  comments, so no further alignment fixes were needed.

**Checkpoint 16 — Real logo + 3D scroll showcase on the homepage**
- `public/logo.jpg` is your real ENZO logo (from the Instagram profile
  picture). It now replaces the text "ENZO" wordmark in the Navbar,
  Footer, admin sidebar, admin login screen, and the browser tab favicon
  — every spot that previously just rendered the word "ENZO" in the
  display font.
- `src/components/ScrollShowcase.jsx` is the new homepage signature
  motion moment: as you scroll, product cards rise up from below and
  rotate in from a 3D angle (alternating left/right) into a flat resting
  position, then everything else on the page stays calm by contrast.
  It's driven by `framer-motion`'s `useScroll`/`useTransform` per card
  (already a dependency, no new packages needed) and only ever animates
  `transform`/`opacity` (GPU-composited, never triggers layout), so it
  stays smooth on lower-end phones.
- **Responsive**: grid goes 2 → 3 → 4 columns; rotation angles are kept
  modest (14°) so cards never swing outside their column on narrow
  screens; `overflow-x-hidden` on the section guards against any stray
  horizontal scroll from the 3D perspective.
- **Accessibility**: `useReducedMotion()` disables the rise/rotate
  entirely for anyone with that OS preference — cards just fade in
  instead of being skipped or breaking.
- A few of the reference product photos you shared use other brands'
  trademarks (Nike, Real Madrid, national federation crests) — those
  specific images were intentionally not added to the codebase, since
  shipping them as real product photos on a commercial site is a
  trademark risk independent of anything code-related. The showcase pulls
  from whatever products you add through the admin panel, so once you
  upload your own photography it'll animate in automatically — no code
  changes needed on your end for that.

## 4. Things you need to change / decide

Search the code for `CHECKPOINT NOTE` to find every flagged spot. Main ones:

- `server/.env` — needs your Supabase URL + **service_role** key (Project
  Settings → API → service_role, NOT anon). Never put this in the
  frontend `.env`.
- `.env` (frontend) — needs Supabase URL + anon key + `VITE_API_URL`
  pointing at wherever you deploy the backend.
- `src/pages/admin/ProductForm.jsx` — image field is a comma-separated
  URL list for now; wire up Supabase Storage file upload when ready.
- `src/components/Footer.jsx` — replace placeholder contact info with
  real WhatsApp/Instagram/Maps links.
- Real product photos: add real image URLs per product in the admin panel.
- Deployment: the frontend (static) and backend (long-running Node
  process) need separate hosts — e.g. frontend on Vercel/Netlify, backend
  on Render/Railway/Fly.io — with `VITE_API_URL` and `FRONTEND_URL`
  pointed at each other's real URLs.

## 5. Responsive / RTL testing

Layout uses logical properties throughout, so RTL should hold at all the
breakpoints listed in the spec (320–1440px+). Manually re-check the
hamburger menu, cart drawer, and admin sidebar at each breakpoint after
adding real content, since real (longer) Arabic/English copy can reveal
wrapping issues that placeholder text doesn't.


## 7. Update — charts, order visibility, emails, WhatsApp, brighter gold, coin-flip hero

**Database:** all of this is already included if you're on the consolidated `supabase/schema.sql` (see section 1).

**Install new packages:** `npm install` in both the project root (adds
`recharts`) and `/server` (adds `nodemailer`).

**Checkpoint 17 — Dashboard charts**
`GET /api/admin/analytics` (backend) aggregates 14-day sales, order-status
breakdown, and top 5 products. `src/pages/admin/Dashboard.jsx` renders
these with `recharts` — a line chart, a donut, and a bar chart, all
`ResponsiveContainer`-wrapped so they resize automatically on any screen.

**Checkpoint 18 — "What did I order?" visibility**
- `Checkout.jsx` now passes the order's items/total to `OrderConfirmation.jsx`
  via router state right before clearing the cart, so the confirmation
  page shows exactly what was ordered (product, size, quantity, price).
- `Account.jsx` order rows expand to show the same, fetched per-order via
  `GET /api/orders/:id/items` (ownership double-checked server-side).
- Admin's `Orders.jsx` rows expand the same way, plus a status dropdown
  and a note field.

**Checkpoint 19 — Order-status emails**
`server/src/lib/email.js` (nodemailer) sends a bilingual email whenever
an admin updates an order's status from `admin/Orders.jsx` — includes
the new status and the admin's note. Configure real SMTP credentials in
`server/.env` (see the comments in `.env.example`); until then it just
logs to the console instead of failing. Guest checkouts without an email
simply don't get one — everything else still works.

**Checkpoint 20 — WhatsApp contact button**
`src/components/WhatsAppButton.jsx`, a floating button on every storefront
page. **Set your real number** via `VITE_WHATSAPP_NUMBER` in `.env`
(placeholder is a fake number right now).

**Checkpoint 21 — Brighter gold + more white**
`tailwind.config.js` added `enzo.goldBright` (#F5C518) for CTAs/glows/focus
rings, and brightened `white`, `muted`, and `line` tokens slightly across
the board for a less "flat black" feel.

**Checkpoint 22 — Coin-flip hero + showcase click-through**
`src/components/CoinFlipHero.jsx` replaces the old static hero: the logo
is pinned on screen while you scroll and does a real two-turn coin flip
(`rotateY` 0→720°) before scaling down and fading into the product
showcase below. `ScrollShowcase.jsx` cards now link to `/shop` (not
individual product pages, per your request) and fall back to 4 placeholder
cards using the logo if the store has no products yet — so the animation
is never invisible, even on a fresh install.

## 8. Update — smoother scrolling + page transitions

**Install:** `npm install` in the project root (adds `lenis`).

**Checkpoint 23 — Site-wide smooth scroll**
`src/components/SmoothScrollProvider.jsx` wraps the app with Lenis
(confirmed via research as the current standard smooth-scroll library,
~3KB, wraps native scroll rather than faking it). Because it wraps real
scroll events rather than replacing them, `CoinFlipHero.jsx` and
`ScrollShowcase.jsx` needed zero changes — `framer-motion`'s `useScroll`
kept working automatically. Reduced-motion users get `lerp: 1`
(effectively native/instant scrolling, no smoothing), matching how the
rest of the app already treats that preference.

**Checkpoint 24 — Smooth page transitions**
`src/components/PageTransition.jsx` adds a short fade+rise (0.2s) every
time you navigate to a new page, instead of pages snapping in instantly.
Kept deliberately brief so it reads as polish, not a slideshow getting in
the way of quickly browsing the shop.

**Checkpoint 25 — Skeleton loading on the Shop page**
Replaced the plain "…" loading text with placeholder cards matching the
final grid shape (`animate-pulse`), so the page feels like it's loading
smoothly rather than blank-then-popping-in.

## 9. Update — full cinematic hero sequence

**Checkpoint 26 — Background clothes marquee, coin flip from background to front, orbiting garments**
`AnimatedHero.jsx` replaces the earlier `CoinFlipHero.jsx`, combining
three pieces into one scroll-driven sequence:
- `ClothesMarquee.jsx` — a continuous, subtle (8% opacity) horizontal
  drift of clothing shapes behind the headline text. Uses your real
  product photos once you have 6+, otherwise generic silhouette icons
  (`GarmentIcons.jsx` — plain line art, not modeled on any real garment,
  so no trademark concerns like the reference photos flagged earlier).
- The logo now starts small, blurred, and dim — reading as "sitting in
  the background" — then flips (two-axis: `rotateY` 0→360°) while
  scaling up and sharpening into focus as you scroll, i.e. "from the
  background to the front," not just spinning in place.
- `OrbitingGarments.jsx` — once the flip settles, 4-6 garment images
  scatter out around the logo into randomized positions (computed once on
  mount, not on every render) and spin continuously and independently of
  each other (varied speed/direction per item so it doesn't look
  mechanical). Clicking any of them goes to `/shop`.

**Honest technical note:** these are 2D images with CSS 3D transforms
(`rotateY` + perspective), not literal 3D models — there's no 3D asset
pipeline (Three.js, GLTF models, etc.) in this project, and building one
would need real 3D garment assets you don't currently have. This
reproduces the same "spinning in space" visual without that dependency;
if you later want true WebGL 3D product viewers, that's a separate,
larger addition.

**Performance/accessibility:** only `transform`/`opacity`/`filter`
animate (all GPU-composited); the marquee is a pure CSS loop (no
per-frame JS cost); `useReducedMotion()` flattens the flip and scatter to
a plain fade for anyone with that OS preference, consistent with every
other animation in the app.

## 10. Update — faster reveal, filmstrip-style ticker behind the headline

**Checkpoint 27 — Faster hero sequence**
Compressed the timing in `AnimatedHero.jsx`/`OrbitingGarments.jsx`: the
flip now finishes by 30% scroll progress (was 40%), and every orbiting
garment has fully appeared by ~65% (was dragging out to nearly 100%).
The wrapper height dropped from 260vh to 160vh too, so the whole
sequence now plays out over roughly one screen-and-a-bit of scrolling
instead of two full screens — everything is visible much sooner.

**Checkpoint 28 — Filmstrip-style ticker, moved behind the headline specifically**
`ClothesMarquee.jsx` restyled from loosely-spaced floating icons into a
tight video-timeline look: rectangular frames with thin dividers between
them, continuously sliding — like a filmstrip or scrubber ticker. It's
also been moved from sitting behind the entire hero to sitting
specifically behind the headline/subtitle text (`AnimatedHero.jsx`, at
`-z-10` inside the same container as the `<h1>`/`<p>`), per your note,
rather than behind the logo/orbit area too.

## 11. Update — faster/clearer orbit icons, text-first hero, blurred ambient strip, brighter gold+white

**Checkpoint 29 — Orbit icons appear faster and bigger**
`OrbitingGarments.jsx`: items now fully appear within a short window
starting almost right after the logo settles (was a slower, later
reveal), and are ~25% larger — clearer to see and easier to click/tap.
The scatter radius was widened slightly to match, so the bigger icons
don't crowd the logo.

**Checkpoint 30 — Text visible immediately, fades away on scroll**
`AnimatedHero.jsx`: the headline/subtitle/CTA are now fully visible the
moment the page loads — no fade-in delay. As the user starts scrolling,
the text fades AWAY (not in) while the logo flips and the orbit icons
take over, so scrolling reveals "just the icons," matching your note.

**Checkpoint 31 — Ambient blurred strip instead of a crisp filmstrip**
`ClothesMarquee.jsx` restyled again: soft, blurred (CSS `blur-sm`),
low-opacity (10%) rounded cards sliding continuously behind the headline
— reads as background texture/ambience rather than a distinct visual
element, per your "don't want it to be so visible" note. Still uses real
product photos once you have 6+, generic silhouette icons otherwise.

**Checkpoint 32 — Brighter gold + more white**
`tailwind.config.js`'s `goldBright` bumped to a more vivid `#FFD23F`
(was `#F5C518`), used across every gradient CTA/glow/chart accent. Added
a white highlight into the ring-glow gradient (gold → white → bright
gold) and switched the global focus-visible outline to white for both
higher contrast and to bring more white into the palette per your note.
Gold CTA buttons also got a subtle inset white edge highlight.

## 12. Update — hover spotlight on the logo and orbit icons

**Checkpoint 33 — Blur-everything-except-the-hovered-item effect**
`SpotlightOverlay.jsx` is a full-page `backdrop-blur` layer that fades in
whenever the logo or any orbiting icon is hovered (or keyboard-focused).
The hovered element is bumped to a higher z-index than the overlay, so it
renders sharp above the blur while everything else — navbar included —
softens behind it. State (`focused`) is lifted into `AnimatedHero.jsx`
and shared between the logo and `OrbitingGarments.jsx`. Works with
keyboard navigation (Tab) too, not just mouse hover, for accessibility.

## 13. Fixes — duplicated icons, invisible marquee, laggy blur spotlight

**Bug fix — duplicated orbit icons**
`GarmentIcons.jsx` only has 4 unique icons, but the fallback in
`OrbitingGarments.jsx` was requesting 6 items and cycling through with
modulo — so 2 of the 6 repeated an already-used shape. Now capped at
exactly `GARMENT_ICONS.length` so every fallback icon is unique. (Add
more icons to that file if you want more than 4 before you have 4+ real
products with photos.)

**Bug fix — marquee was effectively invisible**
The previous version was 10% opacity plus a fairly strong blur on dark
gray cards against a near-black page — barely distinguishable from the
background at all. `ClothesMarquee.jsx` is now ~22% opacity with a
lighter blur and a gold tint, enough to actually read as a moving strip
behind the text while still staying clearly secondary to the headline.

**Fix — hover-spotlight flicker + weak effect**
`AnimatedHero.jsx` now debounces the hover handlers (`focusItem`/
`blurItem`): moving your mouse across the small gap between two orbit
icons no longer flickers the blur off and back on. `SpotlightOverlay.jsx`'s
dim was also strengthened (30% → 55% black) so the effect reads clearly
against the site's already-dark theme, and the focused logo/icon now gets
a gold glow (`shadow`/`ring`) so it's obvious which element is "in focus,"
not just sharp-vs-blurred.

## 14. Update — removed hover-blur, added colors + gallery upload, fixed i18n gaps

**Removed — hover-spotlight effect**
Deleted entirely (`SpotlightContext.jsx`, all related code in
`AnimatedHero.jsx`/`OrbitingGarments.jsx`). Hover has no meaning on touch
devices, and this is primarily a mobile audience — it was dead code for
most visitors. Tapping the logo/icons still navigates to `/shop` exactly
as before.

**Run this new migration:** `supabase/migration_v6.sql` (adds
`products.colors`, `order_items.color`, and the `product-images` Storage
bucket + policies). Already included in the consolidated `schema.sql` for
fresh installs.

**Checkpoint 34 — Size and color menus instead of typed text**
`admin/ProductForm.jsx` rebuilt: sizes and colors are now click-to-toggle
button/swatch menus (`ALL_SIZES` / `PRESET_COLORS` in that file), stored
as plain string arrays — no more typing comma-separated values correctly.
Add more options to either constant if you need something not listed.

**Checkpoint 35 — Upload photos from your gallery**
`src/lib/upload.js` uploads straight to Supabase Storage using the
admin's own session (the `product-images` bucket + its admin-only-write
policy enforce security server-side, same pattern as everywhere else in
this app). The image field in `ProductForm.jsx` is now a real file
picker with thumbnail previews and remove buttons — no more pasting URLs.

**Checkpoint 36 — Colors threaded through the whole order flow**
Added color selection to `ProductDetail.jsx` (a swatch picker next to
size), and threaded it through `CartContext.jsx`, `Cart.jsx`,
`CartDrawer.jsx`, `Checkout.jsx`, `OrderConfirmation.jsx`, `Account.jsx`,
and admin `Orders.jsx` — everywhere size already showed, color now shows
alongside it (e.g. "Gold / M"). `place_order()` (the atomic checkout
function) now stores color per line item too.

**Bug fixes — i18n gaps found during the alignment audit**
- Admin `Customers.jsx` had hardcoded English column headers ("Name",
  "Email", "Phone") that never translated to Arabic — fixed with proper
  `customersPage.*` translation keys.
- `ProductForm.jsx`'s "Material"/"Fit"/"Care" field labels were
  hardcoded English — now reuse the existing `product.material` /
  `product.fit` / `product.care` keys from `common.json`.
- Full re-audit of every component for hardcoded `left-`/`right-`/
  `ml-`/`mr-`/`pl-`/`pr-` classes found none outside of code comments —
  the logical-properties discipline has held since the last audit.

## 15. Update — real security checks on image uploads

**Run this new migration:** `supabase/migration_v7.sql` (locks down the
`product-images` bucket). Already included in the consolidated
`schema.sql` for fresh installs.

**Checkpoint 37 — Three-layer defense against disguised/malicious file uploads**
Previously, `accept="image/*"` on the file input was just a UI hint — it
doesn't stop someone from uploading a renamed non-image file. Now there
are three independent layers, explained in full in `src/lib/upload.js`:

1. **MIME type check** — fast, but the browser-reported type can be
   spoofed, so this alone isn't real security.
2. **Magic-byte signature check** — reads the actual first few bytes of
   the file and confirms they match a real image format's binary
   signature. This is what catches something like `malware.exe` renamed
   to `totally-a-shirt.jpg` — renaming a file doesn't change its actual
   byte content, so the disguise fails here even though the extension
   and reported MIME type look fine.
3. **Storage-level enforcement** (`schema.sql`'s bucket definition —
   `file_size_limit` + `allowed_mime_types`) — **this is the real
   security boundary.** It's enforced by Supabase itself, so it can't be
   bypassed by editing the frontend JS or calling the upload API
   directly with another tool. Layers 1-2 just give the admin a fast,
   friendly error message instead of a raw rejection.

Also: one rejected file in a multi-file selection no longer blocks the
other valid files in the same batch from uploading (`Promise.allSettled`,
not `Promise.all`).

**Honest scope note:** these checks confirm a file IS a real image and
isn't grossly oversized — they don't scan image *content* for hidden
exploits (e.g., a maliciously crafted image designed to exploit a bug in
some specific image-viewing software). That's a deeper concern usually
solved with a server-side re-encoding pipeline, which is a separate,
larger addition if you ever want it — not something this checklist
silently skipped.

## 16. Update — admin-managed categories (no more static/seeded-only list)

**Checkpoint 38 — Full category management in the dashboard**
Previously, categories only existed via the one-time SQL seed in
`schema.sql` (t-shirts, sweats, shoes, pants, training) — the only way
to add or rename one was editing SQL directly. Now there's a full admin
page for it:
- `src/pages/admin/Categories.jsx` — new sidebar tab. Add a category with
  any name (Arabic + English) and slug you want, rename any existing one
  inline, or delete one.
- Backend: `POST` / `PUT` / `DELETE /api/admin/categories` in
  `server/src/routes/admin.js`, validated with a new `categorySchema` in
  `server/src/utils/validation.js`.
- Deleting a category is safe — `products.category_id` has `on delete set
  null` (see `schema.sql`), so products using a deleted category just
  become "uncategorized" rather than being deleted themselves.
- No changes needed anywhere else: `Shop.jsx`'s category tabs and
  `ProductForm.jsx`'s category dropdown already read live from
  `GET /api/categories`, so whatever you name things here shows up
  everywhere immediately.

The SQL-seeded categories are still there as a starting point when you
first set up the database, but they're just regular rows now — rename or
delete them from the new admin page like any category you add yourself.

## 17. Update — unified login, admin gets a "Control Panel" shortcut instead of a separate login

**Removed — the separate `/admin/login` page**
An admin was always just a regular Supabase Auth account that happens to
have a row in `admin_users` — there was no real reason for a second,
separate login page. Now there's exactly ONE login (`/login`) for
everyone, customer or admin.

**Checkpoint 39 — Admin sees a "Control Panel" shortcut after signing in**
- `Navbar.jsx`: a small gold dashboard icon appears next to the account
  icon — but ONLY for accounts in `admin_users`. Invisible to every
  normal customer. Same shortcut added to the mobile menu.
- `Account.jsx`: signing in and landing on your account page now shows a
  prominent "Control Panel" card right at the top if you're an admin,
  linking straight to `/admin`.
- `ProtectedAdminRoute.jsx` reworked: visiting `/admin` while logged out
  now sends you to the normal `/login` (and back to `/admin`
  automatically after signing in) instead of a separate login form.
  Visiting it while logged in as a non-admin sends you home instead of
  looping back to a login page you're already past.

Nothing about the actual security changed — RLS policies and the
backend's `requireAdmin` middleware are still the real enforcement,
exactly as before. This only changes how an admin *reaches* the panel.
