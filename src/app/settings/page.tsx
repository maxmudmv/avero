"use client";

import React, { useEffect, useState } from "react";
import { Ban, Bell, Check, Link2, LogOut, Scale, Send, Shield } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassSelect,
  GlassTab,
  GlassTabs,
  GlassTextarea,
  cn,
  useDesignSystem,
  type ThemeMode,
} from "@/design-system";
import {
  apiClient,
  setTmaSessionToken,
  type ServerBlockItem,
} from "@/lib/api-client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreferences,
} from "@/lib/validation/notifications";

const LANGUAGE_OPTIONS = [
  { value: "uz", label: "O‘zbekcha", description: "Lotin alifbosi" },
  { value: "en", label: "English", description: "English (US)" },
  { value: "ru", label: "Русский", description: "Русский язык" },
];

const PRIVACY_OPTIONS = [
  {
    value: "public",
    label: "Public (Ochiq kuzatish)",
    description: "Postlar ommaviy, istalgan foydalanuvchi darhol kuzatadi",
  },
  {
    value: "private",
    label: "Private (So‘rov bilan kuzatish)",
    description: "Postlar ommaviy, kuzatish so‘rovlarini siz tasdiqlaysiz",
  },
];

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-matte)] px-4 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-[var(--text-primary)]">
          {label}
        </div>
        <div className="text-[12px] text-[var(--text-muted)]">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "glass-focus-ring relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer",
          checked
            ? "border-sky-400/40 bg-sky-400/25"
            : "border-[var(--border-matte)] bg-[var(--surface-input)]"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full transition-transform",
            checked
              ? "translate-x-6 bg-sky-400"
              : "translate-x-1 bg-[var(--text-muted)]"
          )}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme, toast } = useDesignSystem();
  const { auth, refreshAuth } = useAppState();

  const [language, setLanguage] = useState("uz");
  const [privacyLevel, setPrivacyLevel] = useState<"public" | "private">(
    "public"
  );
  const [autoApproveFollows, setAutoApproveFollows] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [allowMentions, setAllowMentions] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [telegramNotifications, setTelegramNotifications] = useState(false);
  const [telegramBotStarted, setTelegramBotStarted] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [saving, setSaving] = useState(false);
  const [confirmingBot, setConfirmingBot] = useState(false);
  const [consentLink, setConsentLink] = useState(false);
  const [telegramLinkDeepLink, setTelegramLinkDeepLink] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ServerBlockItem[]>([]);
  const [warnings, setWarnings] = useState<
    Array<{ id: string; reason: string; createdAt: string }>
  >([]);
  const [appeals, setAppeals] = useState<
    Array<{
      id: string;
      actionType: string;
      reason: string;
      status: string;
      reviewReason: string | null;
      createdAt: string;
    }>
  >([]);
  const [appealActionType, setAppealActionType] = useState<
    "warning" | "mute" | "suspend" | "ban" | "comment_deleted"
  >("warning");
  const [appealReason, setAppealReason] = useState("");
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  useEffect(() => {
    if (!auth?.user) {
      setBlocks([]);
      setWarnings([]);
      setAppeals([]);
      return;
    }
    void apiClient.getBlocks().then((res) => {
      if (res.ok) setBlocks(res.data.blocks);
    });
    void apiClient.getMyAppeals().then((res) => {
      if (res.ok) {
        setWarnings(res.data.warnings);
        setAppeals(res.data.appeals);
      }
    });
  }, [auth?.user]);

  const handleUnblock = async (blockedId: string) => {
    const res = await apiClient.unblockUser(blockedId);
    if (res.ok) {
      setBlocks((prev) => prev.filter((b) => b.blockedId !== blockedId));
      toast({ title: "Bloklash olib tashlandi", variant: "success" });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  useEffect(() => {
    if (!auth?.settings) return;
    setLanguage(auth.settings.language);
    setTheme(auth.settings.theme);
    setPrivacyLevel(
      auth.settings.privacyLevel === "private" ? "private" : "public"
    );
    setAutoApproveFollows(auth.settings.autoApproveFollows ?? true);
    setShowOnlineStatus(auth.settings.showOnlineStatus ?? true);
    setAllowMentions(auth.settings.allowMentions);
    setEmailNotifications(auth.settings.emailNotifications);
    setTelegramNotifications(auth.settings.telegramNotifications);
    setTelegramBotStarted(Boolean(auth.settings.telegramBotStarted));
    setNotifPrefs({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(auth.settings.notificationPreferences ?? {}),
    });
  }, [auth?.settings, setTheme]);

  const handleSaveSettings = async () => {
    if (!auth?.user) {
      toast({
        title: "Lokal sozlamalar qo‘llandi",
        description:
          "Bulutga saqlash uchun Google yoki Telegram orqali kiring.",
        variant: "success",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.updateSettings({
        language,
        theme,
        privacyLevel,
        autoApproveFollows,
        showOnlineStatus,
        allowMentions,
        emailNotifications,
        telegramNotifications,
        notificationPreferences: notifPrefs,
      });

      if (res.ok) {
        await refreshAuth();
        toast({ title: "Sozlamalar saqlandi", variant: "success" });
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTelegramBotStart = async () => {
    setConfirmingBot(true);
    try {
      const res = await apiClient.confirmTelegramBotStart(true);
      if (res.ok) {
        setTelegramBotStarted(true);
        setTelegramNotifications(true);
        await refreshAuth();
        toast({
          title: "Telegram bot bildirishnomalari faollashtirildi",
          variant: "success",
        });
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setConfirmingBot(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (appealReason.trim().length < 10) return;
    setSubmittingAppeal(true);
    try {
      const res = await apiClient.submitAppeal({
        actionType: appealActionType,
        reason: appealReason.trim(),
      });
      if (res.ok) {
        setAppealReason("");
        toast({ title: "Apellyatsiya yuborildi", variant: "success" });
        const refreshed = await apiClient.getMyAppeals();
        if (refreshed.ok) {
          setWarnings(refreshed.data.warnings);
          setAppeals(refreshed.data.appeals);
        }
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleLinkTelegram = async () => {
    if (!consentLink) {
      toast({
        title: "Rozilik talab qilinadi",
        description: "Akkaunt bog‘lash roziligini tasdiqlang.",
        variant: "warning",
      });
      return;
    }
    const res = await apiClient.initTelegramLink();
    if (res.ok) {
      setTelegramLinkDeepLink(res.data.deepLink);
      toast({
        title: "Bog‘lash havolasi tayyor",
        description: res.data.deepLink
          ? "Telegram Mini App orqali tasdiqlang."
          : "Bir martalik bog‘lash tokeni yaratildi.",
        variant: "success",
      });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleLogout = async (all: boolean) => {
    const res = all ? await apiClient.logoutAll() : await apiClient.logout();
    if (res.ok) {
      setTmaSessionToken(null);
      await refreshAuth();
      toast({
        title: all ? "Barcha sessiyalar yopildi" : "Tizimdan chiqildi",
        variant: "success",
      });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const hasGoogle = auth?.identities.some((i) => i.provider === "google");
  const hasTelegram = auth?.identities.some((i) => i.provider === "telegram");

  return (
    <AppShell title="Sozlamalar">
      <div className="space-y-4">
        {/* 1. Til va Mavzu */}
        <GlassCard padding="md" className="space-y-4">
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[16px] font-semibold text-[var(--text-primary)]"
          >
            Ko‘rinish va Til
          </h2>

          <GlassSelect
            label="Til tanlash"
            sheetTitle="Ilova tilini tanlang"
            value={language}
            onValueChange={setLanguage}
            options={LANGUAGE_OPTIONS}
          />

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
              Dark / Light rejim
            </span>
            <GlassTabs
              value={theme}
              onValueChange={(v) => setTheme(v as ThemeMode)}
              ariaLabel="Mavzu rejimi"
              fullWidth
            >
              <GlassTab value="system">Tizim</GlassTab>
              <GlassTab value="dark">OLED Dark</GlassTab>
              <GlassTab value="light">Pearl Light</GlassTab>
            </GlassTabs>
          </div>
        </GlassCard>

        {/* 2. Maxfiylik va Bildirishnomalar */}
        <GlassCard padding="md" className="space-y-3.5">
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[16px] font-semibold text-[var(--text-primary)]"
          >
            Maxfiylik va Bildirishnomalar
          </h2>

          <GlassSelect
            label="Maxfiylik darajasi (kuzatish so‘rovlari)"
            sheetTitle="Profil maxfiyligi"
            value={privacyLevel}
            onValueChange={(v) => {
              const mode = v as "public" | "private";
              setPrivacyLevel(mode);
              setAutoApproveFollows(mode === "public");
            }}
            options={PRIVACY_OPTIONS}
          />

          <SettingToggle
            label="Onlayn holatini ko‘rsatish"
            description="Profil sahifangizda faollik indikatorini yoqish yoki o‘chirish"
            checked={showOnlineStatus}
            onChange={setShowOnlineStatus}
          />
          <SettingToggle
            label="Kuzatish so‘rovlarini avtomatik tasdiqlash"
            description="O‘chirilganda har bir kuzatuvchi sizning roziligingizni kutadi"
            checked={autoApproveFollows}
            onChange={setAutoApproveFollows}
          />

          <SettingToggle
            label="@mention eslatmalari"
            description="Boshqalar sizni matnda belgilashiga ruxsat berish"
            checked={allowMentions}
            onChange={setAllowMentions}
          />
          <SettingToggle
            label="Email bildirishnomalari"
            description="Muhim xavfsizlik xabarlarini emailga yuborish"
            checked={emailNotifications}
            onChange={setEmailNotifications}
          />
          <SettingToggle
            label="Telegram bot bildirishnomalari"
            description={
              telegramBotStarted
                ? "Bot /start qilingan — rozilik asosida xabar yuboriladi"
                : "Yoqish uchun avval Telegram botni /start qilib tasdiqlang"
            }
            checked={telegramNotifications}
            onChange={(next) => {
              if (next && !telegramBotStarted) {
                toast({
                  title: "Avval Telegram botni /start qiling",
                  description:
                    "Pastdagi tugma orqali botni ishga tushirishni tasdiqlang.",
                  variant: "warning",
                });
                return;
              }
              setTelegramNotifications(next);
            }}
          />

          {auth?.user && !telegramBotStarted ? (
            <div className="space-y-2 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3.5 text-[12.5px]">
              <p className="text-[var(--text-secondary)]">
                Telegram bot orqali xabar olish uchun botni <code>/start</code>{" "}
                bilan ishga tushiring va rozilik bering.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                  <a
                    href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=avero`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="liquid-glass glass-focus-ring inline-flex h-8 items-center rounded-xl px-3 text-[12px] font-medium text-[var(--text-primary)]"
                  >
                    <span className="relative z-10">Botni /start qilish</span>
                  </a>
                ) : null}
                <GlassButton
                  size="sm"
                  variant="glass"
                  loading={confirmingBot}
                  onClick={() => void handleConfirmTelegramBotStart()}
                >
                  <Send className="h-3.5 w-3.5" />
                  /start va rozilikni tasdiqlash
                </GlassButton>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-[var(--border-matte)] pt-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
              <Bell className="h-3.5 w-3.5 text-sky-400" />
              Bildirishnoma turlari (alohida boshqaruv)
            </div>
            <div className="space-y-2">
              {NOTIFICATION_TYPE_LABELS.map((item) => (
                <SettingToggle
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  checked={notifPrefs[item.key]}
                  onChange={(next) =>
                    setNotifPrefs((prev) => ({ ...prev, [item.key]: next }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <GlassButton
              variant="glass"
              loading={saving}
              onClick={() => void handleSaveSettings()}
            >
              <Check className="h-4 w-4" />
              Sozlamalarni saqlash
            </GlassButton>
          </div>
        </GlassCard>

        {/* 3. Akkaunt sozlamalari */}
        <GlassCard padding="md" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2
              style={{ fontFamily: "var(--font-display)" }}
              className="text-[16px] font-semibold text-[var(--text-primary)]"
            >
              Akkaunt sozlamalari
            </h2>
            <GlassBadge variant={auth?.user ? "success" : "matte"}>
              <Shield className="h-3 w-3" />
              {auth?.user ? "Faol sessiya" : "Mehmon"}
            </GlassBadge>
          </div>

          {!auth?.user ? (
            <div className="space-y-3 rounded-2xl border border-[var(--border-matte)] p-4">
              <p className="text-[13.5px] text-[var(--text-secondary)]">
                Google yoki Telegram akkauntlaringizni boshqarish uchun avval
                tizimga kiring.
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/v1/auth/google/start"
                className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-medium text-[var(--text-primary)]"
              >
                <span className="relative z-10">Google bilan kirish</span>
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--border-matte)] px-4 py-3 text-[13.5px]">
                <span>Google</span>
                <GlassBadge variant={hasGoogle ? "success" : "matte"}>
                  {hasGoogle ? "Ulangan" : "Ulanmagan"}
                </GlassBadge>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[var(--border-matte)] px-4 py-3 text-[13.5px]">
                <span>Telegram</span>
                <GlassBadge variant={hasTelegram ? "success" : "matte"}>
                  {hasTelegram ? "Ulangan" : "Ulanmagan"}
                </GlassBadge>
              </div>

              {!hasTelegram ? (
                <div className="space-y-2.5 rounded-2xl border border-[var(--border-matte)] p-3.5">
                  <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentLink}
                      onChange={(e) => setConsentLink(e.target.checked)}
                      className="mt-0.5 accent-sky-400"
                    />
                    <span>
                      Telegram akkauntimni joriy profilimga o‘z roziligim bilan
                      bog‘lashga roziman.
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <GlassButton
                      size="sm"
                      variant="accent"
                      onClick={() => void handleLinkTelegram()}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Telegram ulash
                    </GlassButton>
                    {telegramLinkDeepLink ? (
                      <a
                        href={telegramLinkDeepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="liquid-glass glass-focus-ring inline-flex h-8 items-center rounded-xl px-3 text-[12px] font-medium text-[var(--text-primary)]"
                      >
                        <span className="relative z-10">
                          Telegramda tasdiqlash
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <GlassButton
                  size="sm"
                  variant="subtle"
                  onClick={() => void handleLogout(false)}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Chiqish
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="danger"
                  onClick={() => void handleLogout(true)}
                >
                  Barcha qurilmalardan chiqish
                </GlassButton>
              </div>
            </div>
          )}
        </GlassCard>

        {/* 4. Cheklangan / Bloklangan foydalanuvchilar */}
        {auth?.user ? (
          <GlassCard padding="md" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2
                style={{ fontFamily: "var(--font-display)" }}
                className="flex items-center gap-1.5 text-[16px] font-semibold text-[var(--text-primary)]"
              >
                <Ban className="h-4 w-4 text-rose-400" />
                Bloklangan foydalanuvchilar
              </h2>
              <GlassBadge variant="matte">{blocks.length}</GlassBadge>
            </div>
            {blocks.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                Hozircha bloklangan foydalanuvchilar yo‘q.
              </p>
            ) : (
              <div className="space-y-2">
                {blocks.map((b) => (
                  <div
                    key={b.blockedId}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border-matte)] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <GlassAvatar
                        name={b.displayName}
                        seed={b.username}
                        avatarId={b.avatarId}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                          {b.displayName}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--text-muted)]">
                          @{b.username} ·{" "}
                          {b.level === "dm_only"
                            ? "Faqat DM"
                            : b.level === "follow_only"
                              ? "Kuzatish"
                              : b.level === "content_only"
                                ? "Kontent"
                                : "To‘liq blok"}
                        </div>
                      </div>
                    </div>
                    <GlassButton
                      size="sm"
                      variant="subtle"
                      onClick={() => void handleUnblock(b.blockedId)}
                    >
                      Olib tashlash
                    </GlassButton>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ) : null}

        {/* 5. Ogohlantirishlar va Apellyatsiya */}
        {auth?.user ? (
          <GlassCard padding="md" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2
                style={{ fontFamily: "var(--font-display)" }}
                className="flex items-center gap-1.5 text-[16px] font-semibold text-[var(--text-primary)]"
              >
                <Scale className="h-4 w-4 text-amber-400" />
                Ogohlantirishlar va Apellyatsiya
              </h2>
              <GlassBadge variant="matte">{warnings.length} ta</GlassBadge>
            </div>

            {warnings.length > 0 ? (
              <div className="space-y-2">
                {warnings.map((w) => (
                  <div
                    key={w.id}
                    className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-[13px]"
                  >
                    <div className="font-medium text-[var(--text-primary)]">
                      {w.reason}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                      {new Date(w.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <form onSubmit={handleSubmitAppeal} className="space-y-3 pt-1">
              <GlassSelect
                label="Apellyatsiya turi"
                value={appealActionType}
                onValueChange={(v) =>
                  setAppealActionType(
                    v as
                      | "warning"
                      | "mute"
                      | "suspend"
                      | "ban"
                      | "comment_deleted"
                  )
                }
                options={[
                  { value: "warning", label: "Ogohlantirish ustidan" },
                  { value: "mute", label: "Vaqtincha cheklov (mute)" },
                  { value: "comment_deleted", label: "O‘chirilgan izoh bo‘yicha" },
                ]}
              />
              <GlassTextarea
                label="Apellyatsiya sababi"
                placeholder="Nima uchun qarorni qayta ko‘rib chiqish kerakligini yozing (kamida 10 belgi)..."
                maxLength={500}
                rows={3}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
              />
              <div className="flex justify-end">
                <GlassButton
                  type="submit"
                  size="sm"
                  variant="subtle"
                  loading={submittingAppeal}
                  disabled={appealReason.trim().length < 10}
                >
                  Apellyatsiya yuborish
                </GlassButton>
              </div>
            </form>

            {appeals.length > 0 ? (
              <div className="space-y-2 border-t border-[var(--border-matte)] pt-3">
                {appeals.map((ap) => (
                  <div
                    key={ap.id}
                    className="rounded-2xl border border-[var(--border-matte)] p-3 text-[12.5px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[var(--text-muted)]">
                        {ap.actionType}
                      </span>
                      <GlassBadge
                        variant={
                          ap.status === "approved"
                            ? "success"
                            : ap.status === "rejected"
                              ? "matte"
                              : "accent"
                        }
                      >
                        {ap.status}
                      </GlassBadge>
                    </div>
                    <p className="mt-1 text-[var(--text-secondary)]">
                      {ap.reason}
                    </p>
                    {ap.reviewReason ? (
                      <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                        Qaror: {ap.reviewReason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </GlassCard>
        ) : null}
      </div>
    </AppShell>
  );
}
