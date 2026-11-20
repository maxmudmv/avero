# Texnologik Stek va Bepul Tariflar Tahlili (TECH_STACK.md)

Ushbu hujjat tanlangan texnologiyalar, ularning **tekshirilgan joriy bepul tarif (Free Tier) cheklovlari**, muqobillar bilan taqqoslash va **vendor lock-in’dan chiqish strategiyasini** o‘z ichiga oladi.

---

## 1. Tanlangan Asosiy Texnologik Stek

| Qatlam | Tanlangan Texnologiya | Asoslash |
| :--- | :--- | :--- |
| **Til** | **TypeScript (Strict Mode)** | Frontend, Backend va DB sxemada end-to-end type safety |
| **Full-Stack Framework** | **Next.js (App Router)** | Web SSR/SEO + OpenGraph + yagona ilovada Web va TMA |
| **Unified API Router** | **Hono** (`/api/v1/[[...route]]`) | ~14 KB, toza middleware pipeline, istalgan runtime’ga ko‘chiriladi |
| **UI & Styling** | **Tailwind CSS + Radix/shadcn** | Tez UI qurish, Telegram `themeParams` CSS variables bilan oson moslashuv |
| **Client Data Layer** | **TanStack Query** | Cursor-based infinite feed, optimistic like/repost/follow |
| **Telegram Integratsiya** | **@telegram-apps/sdk-react** | Rasmiy zamonaviy TMA SDK (viewport, theme, BackButton, startapp) |
| **Validatsiya** | **Zod** | Client va Server uchun yagona schema validatsiya |
| **ORM & Migratsiya** | **Drizzle ORM + Drizzle Kit** | ~7.4 KB, zero native binaries (Node v26 mos!), PostgreSQL RLS bilan ideal |
| **Database** | **PostgreSQL (Neon Free Tier)** | 1 GB bepul xotira, nativ RLS, Full-Text Search, 7 kunlik majburiy pause yo‘q |
| **Rate Limit / Kesh** | **Upstash Redis (Free Tier)** | 500K komanda/oy, HTTP REST, kartasiz bepul, lokal fallback bilan |
| **Web Auth** | **Standard Google OAuth 2.0 (Arctic / OIDC)** | 100% bepul, MAU limiti yo‘q, Auth0/Clerk lock-in yo‘q |
| **TMA Auth** | **Node `crypto` (HMAC-SHA256)** | Tashqi kutubxonasiz rasmiy Telegram `initData` verifikatsiyasi |
| **DNS / SSL / WAF** | **Cloudflare Free** | Cheksiz DNS, avtomatik TLS, DDoS va bot himoyasi |
| **Testing** | **Vitest + Playwright** | Tez unit/integration (auth, RLS, linking) va E2E testlar |
| **CI/CD** | **GitHub Actions** | Public repo uchun cheksiz, private uchun 2,000 daqiqa/oy bepul |

---

## 2. Tekshirilgan Bepul Tariflar va Cheklovlar (2026)

Barcha xizmatlar kredit kartasiz yoki majburiy to‘lovsiz ishga tushirilishi tekshirildi:

### 2.1. Ma’lumotlar Bazasi: Neon vs Supabase

| Mezon | **Neon Free Tier (Tanlangan)** | Supabase Free Tier (Muqobil) |
| :--- | :--- | :--- |
| **Narxi** | **$0 / oy** | $0 / oy |
| **Xotira (Storage)** | **1 GB / loyiha** (2x katta!) | 500 MB / loyiha |
| **Compute limiti** | **100 CU-soat / oy** (~400 faol soat @ 0.25 CU) | Umumiy shared CPU |
| **Harakatsizlik qoidasi** | 5 daqiqada scale-to-zero, **so‘rov kelganda avtomatik uyg‘onadi** | **7 kun harakatsizlikda to‘xtatiladi (pause)** — qo‘lda yoqish kerak |
| **Branching** | **10 ta branch** (dev/staging/prod bepul) | Faqat pullik tarifda |
| **Trafik (Egress)** | 5 GB / oy | 5 GB / oy |
| **PostgreSQL RLS** | To‘liq qo‘llab-quvvatlaydi | To‘liq qo‘llab-quvvatlaydi |

**Xulosa:** Neon 2 barobar ko‘p xotira (1 GB), bepul dev/prod branchlar va 7 kunlik qo‘lda yoqish muammosi yo‘qligi sababli tanlandi. Standart PostgreSQL ishlatilgani uchun istalgan paytda Supabase yoki o‘z VPS’ga ko‘chirish mumkin.

### 2.2. Ilova Hostingi: Cloudflare vs Vercel vs Render vs Koyeb

| Mezon | **Cloudflare Workers/Pages (Free)** | **Vercel Hobby (Free)** | **Render Free** | Koyeb Free |
| :--- | :--- | :--- | :--- | :--- |
| **Tijoriy foydalanish (Commercial)** | **Ruxsat etilgan** | **Taqiqlangan** (faqat shaxsiy/notijoriy) | **Ruxsat etilgan** | Ruxsat etilgan |
| **Kredit karta talabi** | Yo‘q | Yo‘q | Yo‘q | **Ha** (karta tekshiruvi bor) |
| **Statik trafik** | **Cheksiz** | 100 GB / oy | Cheklangan | Cheklangan |
| **Dinamik so‘rovlar** | 100,000 req / kun | 1M invocation / oy | 750 soat / oy | 1 servis |
| **Asosiy cheklov** | 10 ms CPU/req (OpenNext kerak; Paid $5/oy) | Tijoriy bo‘lsa $20/seat Pro kerak | 15 daq uxlash (~1 daq uyg‘onish) | Free’da custom domain yo‘q |

**Tavsiya qilingan strategiya:**
- Ilova standart **Next.js (`output: 'standalone'`)** ko‘rinishida yoziladi — hech qaysi hostingning maxsus SDK’siga bog‘lanmaydi.
- **Lokal va shaxsiy/beta test bosqichida:** Vercel Hobby (notijoriy) yoki Render Free.
- **Ommaviy/tijoriy ishga tushirishda (bepul):** Cloudflare Workers (OpenNext) yoki keyinchalik $5/oy Cloudflare Paid / $5/oy VPS Docker.

### 2.3. Boshqa Muhim Xizmatlar

| Xizmat | Bepul Tarif Limiti | Izoh |
| :--- | :--- | :--- |
| **Upstash Redis Free** | **500,000 komanda/oy**, 10 GB trafik, 250 MB RAM, kartasiz | Rate limiting uchun a’lo; yo‘q bo‘lsa fallback ishlaydi |
| **Google OAuth 2.0 (Standard)** | **100% bepul**, MAU to‘lovi yo‘q | Faqat `openid email profile` scope’lari (sensitive verification talab qilinmaydi; faqat Public qilishda Privacy Policy URL kerak) |
| **Telegram Bot API & Mini Apps** | **100% bepul**, cheksiz foydalanuvchi | Faqat HTTPS URL kerak |
| **Sentry Developer Free** | 5,000 xatolik / oy | Ixtiyoriy, ishlab chiqarish monitoringi uchun |

---

## 3. ORM Taqqoslash: Drizzle vs Prisma

| Mezon | **Drizzle ORM (Tanlangan)** | Prisma ORM |
| :--- | :--- | :--- |
| **Bundle hajmi** | **~7.4 KB** (zero dependency) | ~1.6 MB (WASM/TS compiler) |
| **Serverless cold start** | **~30–50 ms** | ~300–800 ms |
| **PostgreSQL RLS nazorati** | **Juda yuqori** (`tx.execute` + `pgPolicy`) | O‘rtacha (extension / wrapper ko‘proq) |
| **Node.js v26 mosligi** | Pure JS/TS — **native binary muammosi yo‘q** | Engine/WASM versiya mosligiga sezgir |

---

## 4. Lokal Muhit Eslatmalari (Workspace Tahlili Asosida)

Joriy ishchi muhit (`C:\avero`, Windows) tekshiruvi natijalariga ko‘ra quyidagilar inobatga olindi:
1. **Node.js `v26.13.1`:** Native C++ addonlar (`bcrypt`, `better-sqlite3`, `sharp`) kompilyatsiya xatosi berishi mumkin. Tanlangan stekda (Next.js, Hono, Drizzle, Zod, `node:crypto`) **birorta native C++ addon yo‘q**.
2. **Docker va lokal PostgreSQL yo‘qligi:** Neon’ning bepul **dev branch** funksiyasi tufayli lokal kompyuterga Docker yoki PostgreSQL o‘rnatmasdan ham to‘liq izolyatsiyalangan dev ma’lumotlar bazasida ishlash mumkin (xohlovchilar uchun `docker-compose.yml` ham ixtiyoriy qo‘shiladi).
3. **PowerShell `ExecutionPolicy`:** Hozir tizimda `npm.ps1` bloklangan. Ishlash jarayonida `npm.cmd` ishlatiladi yoki foydalanuvchi ruxsati bilan `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` yoqiladi.

---

## 5. Vendor Lock-in’dan Chiqish (Exit Strategy)

Har qanday xizmat narxini oshirsa yoki cheklov kiritsa, 1 kundan kam vaqtda almashtirish mumkin:

| Joriy Xizmat | Almashtirish Yo‘li | Kod o‘zgarishi |
| :--- | :--- | :--- |
| **Neon PostgreSQL** | `pg_dump` → Supabase / AWS RDS / Hetzner VPS PostgreSQL | Faqat `DATABASE_URL` |
| **Upstash Redis** | Self-hosted Redis / Valkey yoki PostgreSQL rate-limit | Faqat `RateLimiter` adapteri (1 ta fayl) |
| **Vercel / Cloudflare / Render** | `Dockerfile` (`next build` standalone) → istalgan VPS/Cloud | 0 ta biznes-kod o‘zgarishi |
| **Google OAuth** | Standart OIDC protokoli — istalgan qo‘shimcha provayder ulash mumkin | Minimal |
