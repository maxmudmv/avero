# Avero Design System: OLED Matte + Apple Liquid Glass

Ushbu hujjat **Avero** (Web va Telegram Mini App) uchun yaratilgan yagona **OLED Matte + Apple Liquid Glass** dizayn tizimining tokenlari, yorug‘lik fizikasi, animatsiya standartlari, accessibility qoidalari va komponentlar arxitekturasini tavsiflaydi.

---

## 1. Rang Falsafasi (`src/design-system/tokens/colors.ts` & `src/app/globals.css`)

### Dark Mode — OLED Matte
- **Asosiy fon (`--bg-canvas`):** `#060709` (OLED ekranlar uchun chuqur qora-kulrang).
- **Matte karta (`--surface-matte`):** `rgba(18, 20, 26, 0.94)`.
- **Karta chegarasi (`--border-matte`):** `rgba(255, 255, 255, 0.075)` (hech qachon qalin oq ramkalar ishlatilmaydi).

### Light Mode — Pearl White
- **Asosiy fon (`--bg-canvas`):** `#f2f4f8`.
- **Pearl White yuza (`--surface-matte`):** `rgba(255, 255, 255, 0.88)` nozik marvarid jilosi bilan.
- **Yumshoq chegara (`--border-matte`):** `rgba(15, 23, 42, 0.075)`.

---

## 2. Apple Liquid Glass Effekti

Tugmalar (`GlassButton`), aktiv tablar (`GlassTab`), dock (`GlassDock`), toastlar (`GlassToast`) va dropdownlar (`GlassDropdown`) quyidagi optik qoidalardan foydalanadi:

- **Shaffof oyna:** `background-color: var(--glass-fill)` — qattiq oq rangli tugmalar ishlatilmaydi.
- **Backdrop refraksiya:** `backdrop-filter: blur(22px) saturate(195%)` (ekonom / kuchsiz mobil rejimda `blur(14px) saturate(165%)`).
- **1.5px Prizmatik chegara:** `::before` pseudo-elementida `padding: 1.5px` va `mask-composite: exclude` (`-webkit-mask-composite: xor`) yordamida ichki qismi kesib olingan rainbow-white konik gradient.
- **Ikki qatlamli jilo:** `--lg-angle` tashqi prizmatik chetni, `--lg-angle-alt` esa ichki shaffof sinish nurini boshqaradi.

---

## 3. Dinamik Yorug‘lik Fizikasi (`src/design-system/physics/light-physics.ts`)

`LiquidGlassPhysicsEngine` React state’ni yangilamasdan (0 ta re-render) to‘g‘ridan-to‘g‘ri `:root` CSS o‘zgaruvchilarini (`--lg-angle`, `--lg-angle-alt`) `requestAnimationFrame` orqali yangilaydi:

1. **`DeviceOrientationEvent`:** Mobil qurilma giroskopi (`gamma`, `beta`) asosida yorug‘lik burchagini tabiiy egadi (iOS uchun `requestGyroPermission()` qo‘llab-quvvatlanadi).
2. **`Scroll`:** Sahifa skrolli va tezligi yorug‘likni qisqa refraksiya qiladi.
3. **`Pointermove`:** Sichqoncha/kursor vektori giroskop yo‘q desktop va qurilmalarda fallback hamda aniq burchak beradi.
4. **Ko‘p to‘lqinli breathing sway:** Butun sonli bo‘lmagan garmonik chastotalar (`0.47`, `1.13`, `0.23` va `0.39`, `0.89`, `0.19`) yordamida oddiy aylanuvchi gradient o‘rniga tabiiy nafas oluvchi nur tebranishi hosil qilinadi.

**Performance optimizatsiyasi:**
- Sahifa ko‘rinmay qolganda (`document.hidden`) `rAF` to‘xtaydi.
- `prefers-reduced-motion: reduce` yoqilgan bo‘lsa animatsiya va `rAF` to‘liq to‘xtatiladi.
- Qurilma quvvati (`hardwareConcurrency`, `deviceMemory`, coarse pointer) ga qarab FPS (`60` / `45` / `30`) moslashadi.

---

## 4. Z-Index Qatlamlari (`src/design-system/tokens/z-index.ts`)

| Qatlam | Z-Index | Mexanizm |
| :--- | :---: | :--- |
| `GlassDock` | `40` | Inline floating nav |
| `GlassModal` | `70` | `createPortal` → `document.body` (Sticky Header + Sticky Footer) |
| `GlassSheet` | `75` | `createPortal` → `document.body` |
| `GlassDropdown` | `85` | `createPortal` → `document.body` |
| `GlassSelect` | `90` | `createPortal` → `document.body` (Bottom-Sheet ko‘rinishida) |
| `GlassToastViewport` | `95` | `createPortal` → `document.body` (`aria-live="polite"`) |

---

## 5. Tugma Animatsiyasi va Telegram Haptics

- **Framer Motion `whileTap`:** `{ scaleX: 1.055, scaleY: 0.91 }`
- **Spring:** `{ type: "spring", stiffness: 460, damping: 17 }`
- **Radial Glare:** Pointer/barmoq tekkan nuqtada `--glare-x` / `--glare-y` DOM orqali yangilanadi.
- **Telegram HapticFeedback:** Telegram Mini App ichida mavjud bo‘lsa `impactOccurred`, `selectionChanged` va `notificationOccurred` avtomatik ishlaydi.

---

## 6. Komponentlar Ro‘yxati (`src/design-system/index.ts`)

- `GlassButton` · `GlassCard` · `GlassTabs` / `GlassTab` · `GlassDock`
- `GlassModal` · `GlassSheet` · `GlassSelect` · `GlassDropdown`
- `GlassInput` · `GlassTextarea` · `GlassBadge` · `GlassAvatar` (faqat matnli monogramma) · `GlassToast` / `GlassToastViewport`

**Jonli Demo:** `/design-system` sahifasida barcha komponentlar va jonli yorug‘lik fizikasi ko‘rsatilgan.
