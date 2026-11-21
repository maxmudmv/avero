"use client";

import React, { useEffect, useState } from "react";
import { Ban, Bell, Check, Link2, LogOut, Moon, Scale, Send, Sun } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassButton,
  GlassCard,
  GlassSelect,
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
  normalizeAppLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreferences,
} from "@/lib/validation/notifications";

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
    <div className="flex items-center justify-between gap-4 py-3">
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

function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: React.ReactNode; title?: string }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border-matte)] p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            aria-label={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              "glass-focus-ring inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2.5 text-[12px] font-semibold transition-colors cursor-pointer",
              active
                ? "bg-[var(--text-primary)] text-[var(--bg-canvas)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme, toast } = useDesignSystem();
  const {
    auth,
    refreshAuth,
    language: appLanguage,
    setLanguage: setAppLanguage,
    t,
  } = useAppState();

  const [language, setLanguage] = useState<AppLanguage>(appLanguage);
  useEffect(() => {
    setLanguage(appLanguage);
  }, [appLanguage]);

  const handleLanguageChange = (nextVal: string) => {
    const nextLang = normalizeAppLanguage(nextVal);
    setLanguage(nextLang);
    setAppLanguage(nextLang);
    if (auth?.user) {
      void apiClient.updateSettings({ language: nextLang }).then((res) => {
        if (res.ok) {
          void refreshAuth();
        }
      });
    }
  };
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
    setLanguage(normalizeAppLanguage(auth.settings.language));
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
        setAppLanguage(language);
        await refreshAuth();
        toast({ title: t.settings.savedToast, variant: "success" });
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

  const sectionTitle =
    "text-[15px] font-semibold text-[var(--text-primary)]";
  const textLink =
    "glass-focus-ring inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-primary)] underline-offset-4 hover:underline";

  return (
    <AppShell title={t.settings.pageTitle}>
      <GlassCard
        padding="lg"
        className="divide-y divide-[var(--border-matte)] [&>section]:py-6 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0"
      >
        {/* 1. Til va Mavzu — ixcham qatorlar */}
        <section className="divide-y divide-[var(--border-matte)]">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[14px] font-medium text-[var(--text-primary)]">
              {t.settings.languageLabel}
            </span>
            <Segmented
              ariaLabel={t.settings.languageLabel}
              value={language}
              onChange={handleLanguageChange}
              options={[
                { value: "uz", label: "UZ" },
                { value: "en", label: "EN" },
                { value: "ru", label: "RU" },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[14px] font-medium text-[var(--text-primary)]">
              {t.settings.themeLabel}
            </span>
            <Segmented
              ariaLabel={t.settings.themeLabel}
              value={theme === "system" ? resolvedTheme : theme}
              onChange={(v) => setTheme(v as ThemeMode)}
              options={[
                {
                  value: "light",
                  label: <Sun className="h-4 w-4" />,
                  title: t.settings.themeLight,
                },
                {
                  value: "dark",
                  label: <Moon className="h-4 w-4" />,
                  title: t.settings.themeDark,
                },
              ]}
            />
          </div>
        </section>

        {/* 2. Maxfiylik */}
        <section className="space-y-3">
          <h2 style={{ fontFamily: "var(--font-display)" }} className={sectionTitle}>
            {t.settings.privacyTitle}
          </h2>

          <GlassSelect
            label={t.settings.privacyLevelLabel}
            sheetTitle={t.settings.privacyLevelLabel}
            value={privacyLevel}
            onValueChange={(v) => {
              const mode = v as "public" | "private";
              setPrivacyLevel(mode);
              setAutoApproveFollows(mode === "public");
            }}
            options={[
              {
                value: "public",
                label: t.settings.privacyPublic,
                description: t.settings.privacyPublicDesc,
              },
              {
                value: "private",
                label: t.settings.privacyPrivate,
                description: t.settings.privacyPrivateDesc,
              },
            ]}
          />

          <div className="divide-y divide-[var(--border-matte)]">
            <SettingToggle
              label={t.settings.showOnlineLabel}
              description={t.settings.showOnlineDesc}
              checked={showOnlineStatus}
              onChange={setShowOnlineStatus}
            />
            <SettingToggle
              label={t.settings.autoApproveLabel}
              description={t.settings.autoApproveDesc}
              checked={autoApproveFollows}
              onChange={setAutoApproveFollows}
            />
            <SettingToggle
              label={t.settings.allowMentionsLabel}
              description={t.settings.allowMentionsDesc}
              checked={allowMentions}
              onChange={setAllowMentions}
            />
          </div>
        </section>

        {/* 3. Bildirishnomalar */}
        <section className="space-y-3">
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className={cn(sectionTitle, "flex items-center gap-1.5")}
          >
            <Bell className="h-4 w-4 text-[var(--text-muted)]" />
            {t.settings.notifEventsTitle}
          </h2>

          <div className="divide-y divide-[var(--border-matte)]">
            <SettingToggle
              label={t.settings.emailNotifLabel}
              description={t.settings.emailNotifDesc}
              checked={emailNotifications}
              onChange={setEmailNotifications}
            />
            <SettingToggle
              label={t.settings.telegramNotifLabel}
              description={t.settings.telegramNotifDesc}
              checked={telegramNotifications}
              onChange={(next) => {
                if (next && !telegramBotStarted) {
                  toast({
                    title: t.settings.telegramNotifDesc,
                    variant: "warning",
                  });
                  return;
                }
                setTelegramNotifications(next);
              }}
            />
            {auth?.user && !telegramBotStarted ? (
              <div className="space-y-2.5 py-3 text-[12.5px]">
                <p className="text-[var(--text-muted)]">
                  Telegram bot orqali xabar olish uchun botni <code>/start</code>{" "}
                  bilan ishga tushiring va rozilik bering.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                    <a
                      href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=avero`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={textLink}
                    >
                      Botni ochish
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

          <div className="flex justify-end pt-2">
            <GlassButton
              variant="glass"
              loading={saving}
              onClick={() => void handleSaveSettings()}
            >
              <Check className="h-4 w-4" />
              {t.settings.saveSettings}
            </GlassButton>
          </div>
        </section>

        {/* 4. Akkaunt */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 style={{ fontFamily: "var(--font-display)" }} className={sectionTitle}>
              {t.settings.accountTitle}
            </h2>
            <span className="text-[12px] text-[var(--text-muted)]">
              {auth?.user ? t.settings.activeSession : t.settings.guest}
            </span>
          </div>

          {!auth?.user ? (
            <div className="space-y-3">
              <p className="text-[13.5px] text-[var(--text-secondary)]">
                {t.settings.signInToManage}
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/v1/auth/google/start"
                className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-medium text-[var(--text-primary)]"
              >
                <span className="relative z-10">{t.auth.loginWithGoogle}</span>
              </a>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--border-matte)] text-[13.5px]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-[var(--text-primary)]">Google</span>
                  <span
                    className={cn(
                      "text-[12.5px]",
                      hasGoogle ? "text-emerald-400" : "text-[var(--text-muted)]"
                    )}
                  >
                    {hasGoogle ? t.settings.connected : t.settings.notConnected}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[var(--text-primary)]">Telegram</span>
                  <span
                    className={cn(
                      "text-[12.5px]",
                      hasTelegram ? "text-emerald-400" : "text-[var(--text-muted)]"
                    )}
                  >
                    {hasTelegram ? t.settings.connected : t.settings.notConnected}
                  </span>
                </div>
                {!hasTelegram ? (
                  <div className="space-y-3 py-3">
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
                    <div className="flex flex-wrap items-center gap-4">
                      <GlassButton
                        size="sm"
                        variant="glass"
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
                          className={textLink}
                        >
                          Telegramda tasdiqlash
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <GlassButton
                  size="sm"
                  variant="glass"
                  onClick={() => void handleLogout(false)}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t.settings.logoutCurrent}
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="glass"
                  className="text-rose-400"
                  onClick={() => void handleLogout(true)}
                >
                  {t.settings.logoutAll}
                </GlassButton>
              </div>
            </>
          )}
        </section>

        {/* 5. Bloklangan foydalanuvchilar */}
        {auth?.user ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2
                style={{ fontFamily: "var(--font-display)" }}
                className={cn(sectionTitle, "flex items-center gap-1.5")}
              >
                <Ban className="h-4 w-4 text-[var(--text-muted)]" />
                Bloklangan foydalanuvchilar
              </h2>
              <span className="font-mono text-[12px] text-[var(--text-muted)]">
                {blocks.length}
              </span>
            </div>
            {blocks.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                Hozircha bloklangan foydalanuvchilar yo‘q.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-matte)]">
                {blocks.map((b) => (
                  <div
                    key={b.blockedId}
                    className="flex items-center justify-between gap-2 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <GlassAvatar
                        name={b.displayName}
                        seed={b.username}
                        avatarId={b.avatarId}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                          @{b.username}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-muted)]">
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
                      variant="glass"
                      onClick={() => void handleUnblock(b.blockedId)}
                    >
                      Olib tashlash
                    </GlassButton>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* 6. Ogohlantirishlar va Apellyatsiya */}
        {auth?.user ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2
                style={{ fontFamily: "var(--font-display)" }}
                className={cn(sectionTitle, "flex items-center gap-1.5")}
              >
                <Scale className="h-4 w-4 text-[var(--text-muted)]" />
                Ogohlantirishlar va Apellyatsiya
              </h2>
              <span className="font-mono text-[12px] text-[var(--text-muted)]">
                {warnings.length}
              </span>
            </div>

            {warnings.length > 0 ? (
              <div className="divide-y divide-[var(--border-matte)]">
                {warnings.map((w) => (
                  <div key={w.id} className="py-3 text-[13px]">
                    <div className="font-medium text-amber-400">{w.reason}</div>
                    <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                      {new Date(w.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <form onSubmit={handleSubmitAppeal} className="space-y-3">
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
                  variant="glass"
                  loading={submittingAppeal}
                  disabled={appealReason.trim().length < 10}
                >
                  Apellyatsiya yuborish
                </GlassButton>
              </div>
            </form>

            {appeals.length > 0 ? (
              <div className="divide-y divide-[var(--border-matte)] border-t border-[var(--border-matte)]">
                {appeals.map((ap) => (
                  <div key={ap.id} className="py-3 text-[12.5px]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[var(--text-muted)]">
                        {ap.actionType}
                      </span>
                      <span
                        className={cn(
                          "text-[12px]",
                          ap.status === "approved"
                            ? "text-emerald-400"
                            : ap.status === "rejected"
                              ? "text-[var(--text-muted)]"
                              : "text-[var(--text-secondary)]"
                        )}
                      >
                        {ap.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--text-secondary)]">{ap.reason}</p>
                    {ap.reviewReason ? (
                      <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                        Qaror: {ap.reviewReason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </GlassCard>
    </AppShell>
  );
}
