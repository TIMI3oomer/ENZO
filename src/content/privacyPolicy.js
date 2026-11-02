// CHECKPOINT NOTE (src/content/privacyPolicy.js):
// Text of the /privacy page (pages/Privacy.jsx), Arabic + English.
// Written to match what this codebase ACTUALLY does -- keep it in sync
// when that changes. What it describes, and where it lives in the code:
// - Account: Supabase Auth (email + hashed password, or Google sign-in)
//   and the `profiles` table (name, phone, city, address, points).
// - Orders: `orders` / `order_items` (name, phone, email, city, address,
//   notes, items, totals, delivery region, payment method/status, language,
//   discount code, points), plus status history and returns.
// - Services: Supabase (database/auth/photos), Vercel (hosting + server
//   logs), Resend (order emails), Stripe (card payments, only when card is
//   used), Google Fonts (fonts), Google (only if "Continue with Google"),
//   WhatsApp (only if the customer taps the WhatsApp button).
// - On the device (localStorage): cart, language, sign-in session, the
//   "tour seen" flag; sessionStorage: a reload-once flag. No analytics,
//   advertising or tracking cookies/pixels anywhere in the code.
// - In-store sales: optional phone lookup to give an account points.
// - Not automated (so not promised): account deletion is done on request,
//   and there is no fixed automatic deletion schedule.
export const PRIVACY_UPDATED = "2026-11-03";

export const PRIVACY = {
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث",
    intro:
      "توضح هذه الصفحة ما هي المعلومات التي يجمعها متجر ENZO عندما تتصفح الموقع أو تطلب منه، ولماذا نستخدمها، ومع من تتم مشاركتها، وكيف تطلب الاطلاع عليها أو تعديلها أو حذفها.",
    sections: [
      {
        title: "المعلومات التي نجمعها",
        items: [
          "عند إنشاء حساب: الاسم والبريد الإلكتروني وكلمة المرور (تُحفظ بشكل مُشفّر لا يمكن عكسه، فلا يستطيع أحد — ولا نحن — قراءتها). إذا سجّلت عبر Google نستلم من Google اسمك وبريدك الإلكتروني ورابط صورة حسابك فقط.",
          "في صفحة حسابي (اختياري): رقم الهاتف والمدينة والعنوان لتعبئة الطلبات القادمة تلقائياً.",
          "عند الطلب: الاسم، رقم الهاتف، البريد الإلكتروني (اختياري إلا للدفع بالبطاقة)، منطقة التوصيل، المدينة، العنوان، الملاحظات، القطع المطلوبة (اللون والمقاس والكمية)، المبالغ، طريقة الدفع وحالته، كود الخصم والنقاط إن استُخدمت، ولغة الموقع.",
          "حالة الطلب وتاريخ كل تغيير عليها (لصفحة تتبع الطلب)، وأي إرجاع أو استبدال يتم.",
          "نقاط ENZO: رصيدك وسجل النقاط المكتسبة والمستعملة.",
          "في البيع من المحل: اسم الزبون إن أُعطي (اختياري) واسم البائع، وإذا أردت كسب النقاط: رقم هاتفك لإيجاد حسابك، ويُضاف هذا البيع إلى حسابك.",
          "عند الدفع بالبطاقة: تُدخل بيانات البطاقة في صفحة Stripe الآمنة مباشرة — بيانات بطاقتك لا تمر عبر خوادمنا ولا نحتفظ بها.",
        ],
      },
      {
        title: "لماذا نستخدم هذه المعلومات",
        items: [
          "لتجهيز طلبك وتوصيله إليك والتواصل معك بخصوصه.",
          "لإرسال رسائل بريد عن طلبك عند تغيّر حالته (مثل التأكيد أو الشحن) أو لإبلاغك بالمبلغ النهائي — إذا أعطيتنا بريدك.",
          "لعرض حالة طلبك في صفحة تتبع الطلب.",
          "لحساب نقاط ENZO وأكواد الخصم.",
          "لمعالجة الإرجاع والاستبدال وحفظ سجل المبيعات.",
          "لحماية الموقع من الاستخدام المسيء (مثل تحديد عدد المحاولات من نفس الجهاز).",
          "لا نبيع معلوماتك، ولا نستخدمها للإعلانات، ولا نرسل لك رسائل تسويقية.",
        ],
      },
      {
        title: "مع من نشارك معلوماتك",
        intro: "نشارك فقط ما يلزم لتشغيل المتجر، مع:",
        items: [
          "من يقوم بتوصيل طلبك: الاسم ورقم الهاتف والعنوان، لإيصال الطلب فقط.",
          "Supabase: يستضيف قاعدة البيانات والحسابات وصور المنتجات.",
          "Vercel: يستضيف الموقع والخادم، ويحتفظ بسجلات تقنية مؤقتة للطلبات (مثل عنوان IP وتوقيت الطلب) لأغراض التشغيل والأمان.",
          "Resend: يرسل رسائل البريد الخاصة بطلبك (يستلم بريدك الإلكتروني ومحتوى الرسالة).",
          "Stripe: يعالج الدفع بالبطاقة فقط إذا اخترت الدفع بالبطاقة.",
          "Google: إذا اخترت «المتابعة باستخدام Google» لتسجيل الدخول. كما أن خطوط الكتابة في الموقع تُحمّل من Google Fonts، فيصل إلى Google عنوان IP الخاص بجهازك عند فتح الموقع.",
          "WhatsApp: فقط إذا ضغطت زر واتساب وراسلتنا، وتخضع المحادثة لسياسة WhatsApp.",
          "قد نكشف معلومات إذا طلبت ذلك جهة رسمية بموجب القانون.",
        ],
      },
      {
        title: "ما يُحفظ على جهازك",
        intro:
          "لا نستخدم أي أدوات تحليلات أو إعلانات أو ملفات تتبّع. يحفظ الموقع على جهازك فقط ما يلزم لعمله (في التخزين المحلي للمتصفح):",
        items: [
          "سلة التسوق، حتى لا تضيع إذا أغلقت الصفحة.",
          "اللغة التي اخترتها (العربية أو الإنجليزية).",
          "جلسة تسجيل الدخول، لتبقى مسجلاً على هذا الجهاز.",
          "علامة بأنك شاهدت جولة التعريف بالموقع.",
          "يمكنك حذف كل ذلك في أي وقت من إعدادات المتصفح، أو بتسجيل الخروج.",
        ],
      },
      {
        title: "مدة الاحتفاظ بالمعلومات",
        items: [
          "نحتفظ بالحساب ما دام موجوداً، وبسجلات الطلبات للمدة اللازمة لتشغيل المتجر ومتابعة الإرجاع والاستبدال وحفظ سجل المبيعات.",
          "عند طلب حذف حسابك نحذف بيانات الحساب، وقد نُبقي سجل الطلبات السابقة بالقدر اللازم لحفظ سجل المبيعات.",
        ],
      },
      {
        title: "حقوقك",
        items: [
          "الاطلاع: يمكنك رؤية بياناتك وطلباتك ونقاطك في صفحة «حسابي»، أو أن تطلب منا نسخة منها.",
          "التعديل: يمكنك تعديل الاسم والهاتف والعنوان من صفحة «حسابي».",
          "الحذف: راسلنا لحذف حسابك وبياناتك، وسنقوم بذلك ونؤكد لك.",
          "تسجيل الخروج متاح في أي وقت من القائمة أو صفحة «حسابي».",
        ],
      },
      {
        title: "حماية المعلومات",
        items: [
          "الموقع يعمل عبر اتصال مشفّر (HTTPS)، وكلمات المرور تُحفظ بشكل مُشفّر لا يمكن عكسه.",
          "لوحة التحكم متاحة فقط لأصحاب المتجر المسجلين كمسؤولين، ويتم التحقق من ذلك مع كل طلب.",
          "لا يوجد نظام على الإنترنت آمن بنسبة 100%، لكننا نعمل على حماية معلوماتك وإبلاغك إذا حدث ما يمسّها.",
        ],
      },
      {
        title: "الأطفال",
        items: ["الموقع غير موجّه للأطفال دون 13 عاماً، ولا نجمع معلوماتهم عن قصد."],
      },
      {
        title: "التغييرات على هذه السياسة",
        items: ["إذا غيّرنا هذه السياسة سنحدّث تاريخ «آخر تحديث» أعلى الصفحة."],
      },
    ],
    contactTitle: "تواصل معنا",
    contactIntro: "لأي سؤال عن خصوصيتك أو لطلب نسخة من بياناتك أو حذفها:",
  },

  en: {
    title: "Privacy Policy",
    updated: "Last updated",
    intro:
      "This page explains what information the ENZO store collects when you browse or order, why we use it, who it's shared with, and how you can see, change or delete it.",
    sections: [
      {
        title: "What we collect",
        items: [
          "When you create an account: your name, email and password (stored scrambled one-way, so nobody — including us — can read it). If you sign in with Google, we only receive your name, email and profile picture link from Google.",
          "On My account (optional): phone, city and address, to fill in future orders for you.",
          "When you order: name, phone, email (optional, except for card payments), delivery area, city, address, notes, the items ordered (color, size, quantity), amounts, payment method and status, any discount code or points used, and the site language.",
          "Your order's status and when it changed (for the Track order page), and any returns or exchanges.",
          "ENZO points: your balance and the history of points earned and spent.",
          "In-store sales: the customer's name if given (optional) and the seller's name, and — if you want points — your phone number, used to find your account; the sale is then added to your account.",
          "Card payments: you enter your card details on Stripe's secure page — your card details never pass through our servers and we don't keep them.",
        ],
      },
      {
        title: "Why we use it",
        items: [
          "To prepare and deliver your order and contact you about it.",
          "To email you about your order when its status changes (for example confirmed or shipped) or to tell you the final total — if you gave us your email.",
          "To show your order's progress on the Track order page.",
          "To work out ENZO points and discount codes.",
          "To handle returns and exchanges and keep sales records.",
          "To protect the site from abuse (for example limiting repeated attempts from one device).",
          "We don't sell your information, use it for advertising, or send you marketing messages.",
        ],
      },
      {
        title: "Who we share it with",
        intro: "Only what's needed to run the store, with:",
        items: [
          "Whoever delivers your order: name, phone and address, only to deliver it.",
          "Supabase: hosts the database, accounts and product photos.",
          "Vercel: hosts the website and server, and keeps short-lived technical logs of requests (such as IP address and time) for operation and security.",
          "Resend: sends our order emails (it receives your email address and the message).",
          "Stripe: processes card payments, only if you choose to pay by card.",
          "Google: if you choose \"Continue with Google\" to sign in. The site's fonts are also loaded from Google Fonts, so Google receives your device's IP address when you open the site.",
          "WhatsApp: only if you tap the WhatsApp button and message us; that chat is covered by WhatsApp's own policy.",
          "Authorities, if we're required to by law.",
        ],
      },
      {
        title: "What's saved on your device",
        intro:
          "We don't use any analytics, advertising or tracking cookies or pixels. The site only saves what it needs to work, in your browser's local storage:",
        items: [
          "Your shopping cart, so it isn't lost if you close the page.",
          "Your language (Arabic or English).",
          "Your sign-in session, so you stay signed in on this device.",
          "A note that you've seen the welcome tour.",
          "You can clear all of this at any time in your browser settings, or by signing out.",
        ],
      },
      {
        title: "How long we keep it",
        items: [
          "We keep your account while it exists, and order records for as long as needed to run the store, handle returns and exchanges, and keep sales records.",
          "If you ask us to delete your account, we delete your account details; we may keep past order records to the extent needed for our sales records.",
        ],
      },
      {
        title: "Your rights",
        items: [
          "See your data: your details, orders and points are on My account, or ask us for a copy.",
          "Correct it: change your name, phone and address on My account.",
          "Delete it: message us to delete your account and data — we'll do it and confirm.",
          "You can sign out at any time from the menu or My account.",
        ],
      },
      {
        title: "Keeping it safe",
        items: [
          "The site uses an encrypted connection (HTTPS) and passwords are stored scrambled one-way.",
          "The control panel is only open to the store owners registered as admins, checked on every request.",
          "No online system is 100% secure, but we work to protect your information and will tell you if something affects it.",
        ],
      },
      {
        title: "Children",
        items: ["The site isn't meant for children under 13, and we don't knowingly collect their information."],
      },
      {
        title: "Changes to this policy",
        items: ["If we change this policy, we'll update the \"Last updated\" date at the top of this page."],
      },
    ],
    contactTitle: "Contact us",
    contactIntro: "For any privacy question, or to ask for a copy of your data or for it to be deleted:",
  },
};
