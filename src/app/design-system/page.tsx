"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  Compass,
  Feather,
  Home,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SunMoon,
  User,
} from "lucide-react";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassDock,
  GlassDropdown,
  GlassInput,
  GlassModal,
  GlassSelect,
  GlassSheet,
  GlassTab,
  GlassTabs,
  GlassTextarea,
  useDesignSystem,
} from "@/design-system";

const LANGUAGE_OPTIONS = [
  { value: "uz", label: "O‘zbekcha", description: "Lotin alifbosi (standart)" },
  { value: "uz-Cyrl", label: "Ўзбекча", description: "Kirill alifbosi" },
  { value: "en", label: "English", description: "International English" },
  { value: "ru", label: "Русский", description: "Русский язык" },
];

export default function DesignSystemDemoPage() {
  const {
    theme,
    resolvedTheme,
    setTheme,
    reducedMotion,
    requestGyroPermission,
    subscribeLightAngles,
    toast,
  } = useDesignSystem();

  const [activeTab, setActiveTab] = useState("latest");
  const [dockActive, setDockActive] = useState("home");
  const [language, setLanguage] = useState("uz");
  const [handle, setHandle] = useState("maxmud");
  const [draftText, setDraftText] = useState(
    "Faqat matnli ijtimoiy tarmoq: fikrlar, qisqa eslatmalar va tiniq tipografika."
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Direct DOM ref update for live angle readout — zero React re-renders at 60 FPS!
  const angleReadoutRef = useRef<HTMLSpanElement | null>(null);
  const altAngleReadoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    return subscribeLightAngles(({ angle, angleAlt }) => {
      if (angleReadoutRef.current) {
        angleReadoutRef.current.textContent = `${angle.toFixed(1)}°`;
      }
      if (altAngleReadoutRef.current) {
        altAngleReadoutRef.current.textContent = `${angleAlt.toFixed(1)}°`;
      }
    });
  }, [subscribeLightAngles]);

  const handleGyroEnable = async () => {
    const status = await requestGyroPermission();
    toast({
      title: `Giroskop holati: ${status}`,
      description:
        status === "granted"
          ? "Qurilmani egib ko‘ring — prizmatik nur burchagi jonli o‘zgaradi."
          : "Pointer va scroll fallback avtomatik faol.",
      variant: status === "granted" ? "success" : "default",
    });
  };

  return (
    <div className="relative min-h-screen pb-32">
      {/* Subtle ambient background glow (OLED-safe, low luminance) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-80 opacity-45"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(90, 200, 250, 0.14), transparent 70%)",
        }}
      />

      <main className="relative mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        {/* Top Controls Header */}
        <GlassCard padding="lg">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <GlassBadge variant="glass">
                  <Sparkles className="h-3 w-3" />
                  OLED Matte + Apple Liquid Glass
                </GlassBadge>
                <GlassBadge variant="matte">
                  {resolvedTheme === "dark" ? "OLED Dark (#060709)" : "Pearl Light (#f2f4f8)"}
                </GlassBadge>
                {reducedMotion ? (
                  <GlassBadge variant="warning">Reduced Motion</GlassBadge>
                ) : null}
              </div>

              <h1
                style={{ fontFamily: "var(--font-display)" }}
                className="mt-3 text-[1.75rem] font-bold tracking-[-0.025em] text-[var(--text-primary)]"
              >
                Avero Design System
              </h1>
              <p className="mt-1.5 max-w-xl text-[14.5px] leading-[1.6] text-[var(--text-secondary)]">
                Matnga asoslangan Web va Telegram Mini App ijtimoiy tarmog‘i
                uchun yagona shaffof prizmatik oyna va chuqur mat yuzalar tizimi.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <GlassButton
                variant="glass"
                size="sm"
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                <SunMoon className="h-4 w-4" />
                {resolvedTheme === "dark" ? "Light Mode" : "OLED Dark"}
              </GlassButton>

              <GlassButton variant="subtle" size="sm" onClick={handleGyroEnable}>
                <Compass className="h-4 w-4" />
                Gyro
              </GlassButton>
            </div>
          </div>

          {/* Live Light Physics Readout */}
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[var(--border-matte)] pt-4 text-[12.5px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">--lg-angle:</span>
              <span
                ref={angleReadoutRef}
                className="font-mono font-medium tabular-nums text-[var(--text-primary)]"
              >
                132.0°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">--lg-angle-alt:</span>
              <span
                ref={altAngleReadoutRef}
                className="font-mono font-medium tabular-nums text-[var(--text-primary)]"
              >
                224.0°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Theme mode:</span>
              <span className="font-mono text-[var(--text-primary)]">{theme}</span>
            </div>
          </div>
        </GlassCard>

        {/* 1. Buttons & Tabs */}
        <section className="grid gap-6 md:grid-cols-2">
          <GlassCard>
            <h2
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[17px] font-semibold tracking-[-0.015em]"
            >
              Liquid Glass Buttons
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              1.5px prizmatik chegara, radial glare va Framer Motion spring tap.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <GlassButton
                variant="glass"
                onClick={() =>
                  toast({
                    title: "Liquid Glass harakati",
                    description: "Spring (460 / 17) va radial glare ishladi.",
                    variant: "success",
                  })
                }
              >
                <Feather className="h-4 w-4" />
                Chop etish
              </GlassButton>
              <GlassButton variant="accent">Tasdiqlash</GlassButton>
              <GlassButton variant="subtle">Keyinroq</GlassButton>
              <GlassButton variant="danger">O‘chirish</GlassButton>
              <GlassButton variant="ghost">Bekor qilish</GlassButton>
              <GlassButton variant="glass" loading>
                Saqlanmoqda
              </GlassButton>
            </div>
          </GlassCard>

          <GlassCard>
            <h2
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[17px] font-semibold tracking-[-0.015em]"
            >
              Liquid Glass Tabs &amp; Dropdown
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              Klaviatura strelkalari bilan boshqariluvchi aktiv oyna kapsulasi.
            </p>
            <div className="mt-5 space-y-4">
              <GlassTabs
                value={activeTab}
                onValueChange={setActiveTab}
                ariaLabel="Feed filters"
                fullWidth
              >
                <GlassTab value="latest">So‘nggi</GlassTab>
                <GlassTab value="following">Obunalar</GlassTab>
                <GlassTab value="saved">Saqlangan</GlassTab>
              </GlassTabs>

              <div className="flex items-center justify-between rounded-2xl border border-[var(--border-matte)] px-4 py-3">
                <span className="text-[13.5px] text-[var(--text-secondary)]">
                  Aktiv tab:{" "}
                  <strong className="font-mono text-[var(--text-primary)]">
                    {activeTab}
                  </strong>
                </span>

                <GlassDropdown
                  ariaLabel="Post actions"
                  trigger={
                    <span className="liquid-glass inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-primary)]">
                      <MoreHorizontal className="relative z-10 h-4 w-4" />
                    </span>
                  }
                  items={[
                    {
                      id: "copy",
                      label: "Havolani nusxalash",
                      onSelect: () =>
                        toast({
                          title: "Havola nusxalandi",
                          variant: "success",
                        }),
                    },
                    {
                      id: "mute",
                      label: "Bildirishnomani o‘chirish",
                      onSelect: () =>
                        toast({
                          title: "Bildirishnomalar o‘chirildi",
                          variant: "warning",
                        }),
                    },
                    {
                      id: "report",
                      label: "Shikoyat yuborish",
                      danger: true,
                      onSelect: () =>
                        toast({
                          title: "Shikoyat oynasi",
                          variant: "error",
                        }),
                    },
                  ]}
                />
              </div>
            </div>
          </GlassCard>
        </section>

        {/* 2. Form Controls & Bottom-Sheet Select */}
        <section className="grid gap-6 md:grid-cols-2">
          <GlassCard>
            <h2
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[17px] font-semibold tracking-[-0.015em]"
            >
              Inputs &amp; Bottom-Sheet Select
            </h2>
            <div className="mt-4 space-y-4">
              <GlassInput
                label="Username"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                leadingIcon={<span className="font-mono text-sm">@</span>}
                hint="Faqat kichik lotin harflari, raqamlar va pastki chiziq."
              />

              <GlassSelect
                label="Interfeys tili (Portal z-90 Bottom Sheet)"
                sheetTitle="Tilni tanlang"
                searchable
                value={language}
                onValueChange={(val) => {
                  setLanguage(val);
                  toast({ title: `Til o‘zgartirildi: ${val}`, variant: "success" });
                }}
                options={LANGUAGE_OPTIONS}
              />
            </div>
          </GlassCard>

          <GlassCard>
            <h2
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[17px] font-semibold tracking-[-0.015em]"
            >
              Text-Only Composer &amp; Overlays
            </h2>
            <div className="mt-4 space-y-4">
              <GlassTextarea
                label="Matnli post namuna"
                maxLength={500}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                hint="Rasm va video yuklash o‘chirilgan — faqat matn."
              />

              <div className="flex flex-wrap gap-2.5">
                <GlassButton variant="glass" onClick={() => setModalOpen(true)}>
                  Modal ochish (z-70)
                </GlassButton>
                <GlassButton variant="subtle" onClick={() => setSheetOpen(true)}>
                  Bottom Sheet (z-75)
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* 3. Typography, Avatars & Badges */}
        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <GlassAvatar name="Maxmudov Developer" seed="maxmud" size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <span
                    style={{ fontFamily: "var(--font-display)" }}
                    className="text-[16px] font-semibold text-[var(--text-primary)]"
                  >
                    Maxmudov
                  </span>
                  <GlassBadge variant="accent">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </GlassBadge>
                  <GlassBadge variant="success">Online</GlassBadge>
                </div>
                <p className="font-mono text-[12.5px] text-[var(--text-muted)]">
                  @maxmud · Text-Only Monogram Avatar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <GlassAvatar name="Avero" seed="avero" size="sm" />
              <GlassAvatar name="Telegram User" seed="tg_1" size="md" />
            </div>
          </div>

          <div className="mt-6 space-y-2.5 border-t border-[var(--border-matte)] pt-5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Tipografika shkalasi (Plus Jakarta Sans + Inter + JetBrains Mono)
            </p>
            <p
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[22px] font-bold tracking-[-0.02em]"
            >
              Sarlavha: O‘qilishi tiniq, matnga yo‘naltirilgan iyerarxiya
            </p>
            <p className="text-[15.5px] leading-[1.6] text-[var(--text-secondary)]">
              Asosiy post matni (15.5px / 1.6 line-height): Har bir satr
              ko‘zni charchatmaydigan darajada ochiq kontrast va muvozanatli
              oraliq bilan bezatilgan.
            </p>
          </div>
        </GlassCard>
      </main>

      {/* Floating Bottom Liquid Glass Dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto">
          <GlassDock
            items={[
              {
                id: "home",
                label: "Lenta",
                icon: <Home className="h-4 w-4" />,
                active: dockActive === "home",
                onSelect: () => setDockActive("home"),
              },
              {
                id: "search",
                label: "Qidiruv",
                icon: <Search className="h-4 w-4" />,
                active: dockActive === "search",
                onSelect: () => setDockActive("search"),
              },
              {
                id: "alerts",
                label: "Xabarlar",
                icon: <Bell className="h-4 w-4" />,
                badge: 3,
                active: dockActive === "alerts",
                onSelect: () => setDockActive("alerts"),
              },
              {
                id: "profile",
                label: "Profil",
                icon: <User className="h-4 w-4" />,
                active: dockActive === "profile",
                onSelect: () => setDockActive("profile"),
              },
            ]}
          />
        </div>
      </div>

      {/* Modal (z-70) with Sticky Header & Sticky Footer */}
      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Liquid Glass Modal (z-index: 70)"
        description="Sticky header va sticky footer bilan skroll qilinadigan oyna."
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setModalOpen(false)}>
              Bekor qilish
            </GlassButton>
            <GlassButton
              variant="glass"
              onClick={() => {
                setModalOpen(false);
                toast({ title: "O‘zgarishlar saqlandi", variant: "success" });
              }}
            >
              Saqlash
            </GlassButton>
          </>
        }
      >
        <div className="space-y-4">
          <p>
            Ushbu modal <code className="font-mono">createPortal</code> orqali{" "}
            <code className="font-mono">document.body</code> ichiga{" "}
            <code className="font-mono">z-index: 70</code> da render qilinadi.
          </p>
          <p>
            Tepasidagi sarlavha va pastidagi tugmalar paneli{" "}
            <code className="font-mono">position: sticky</code> holatda turadi.
          </p>
          <GlassSelect
            label="Modal ichidan GlassSelect (z-90)"
            value={language}
            onValueChange={setLanguage}
            options={LANGUAGE_OPTIONS}
          />
          <p className="text-[13px] text-[var(--text-muted)]">
            Modal ichida ochilgan GlassSelect z-index 90 da bo‘lgani uchun
            modal ustida muammosiz ochiladi.
          </p>
        </div>
      </GlassModal>

      {/* Sheet (z-75) */}
      <GlassSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Sozlamalar varaqasi (GlassSheet)"
        description="Mobil va Telegram Mini App uchun moslashgan pastki panel."
        footer={
          <GlassButton variant="glass" onClick={() => setSheetOpen(false)}>
            Yopish
          </GlassButton>
        }
      >
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-matte)] p-4">
          <SlidersHorizontal className="h-5 w-5 text-sky-400" />
          <p className="text-[13.5px]">
            Tizim 60 FPS dinamik yorug‘lik fizikasidan foydalanadi va
            harakatni kamaytirish (<code className="font-mono">prefers-reduced-motion</code>)
            sozlamasini hurmat qiladi.
          </p>
        </div>
      </GlassSheet>
    </div>
  );
}
