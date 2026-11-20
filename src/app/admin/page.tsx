"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Flag,
  Megaphone,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassModal,
  GlassSelect,
  GlassTab,
  GlassTabs,
  GlassTextarea,
  useDesignSystem,
} from "@/design-system";
import {
  apiClient,
  type AuditLogItem,
  type GovernanceUserItem,
  type ModAppealItem,
  type ModFlagItem,
  type ModReportItem,
} from "@/lib/api-client";

const ADMIN_DELEGATABLE_LABELS: Array<{ code: string; label: string }> = [
  { code: "mod:reports:read", label: "Shikoyatlarni ko‘rish" },
  { code: "mod:reports:resolve", label: "Shikoyatlarni ko‘rib chiqish" },
  { code: "mod:comment:delete", label: "Izohlarni o‘chirish" },
  { code: "mod:user:warn", label: "Ogohlantirish yuborish" },
  { code: "mod:user:mute", label: "Vaqtincha mute" },
  { code: "mod:user:suspend", label: "Vaqtincha cheklov (suspend)" },
  { code: "mod:flags:read", label: "Avto-tekshiruv navbatini ko‘rish" },
  { code: "mod:flags:resolve", label: "Avto-tekshiruvni tasdiqlash" },
  { code: "mod:appeals:read", label: "Apellyatsiyalarni ko‘rish" },
  { code: "mod:appeals:resolve", label: "Apellyatsiya qarori" },
  { code: "admin:user:ban", label: "Doimiy ban / Tiklash" },
  { code: "admin:role:assign", label: "Moderator rolini tayinlash" },
  { code: "admin:audit:read", label: "Audit logni ko‘rish" },
  { code: "admin:announcement:send", label: "Muhim e’lonlar yuborish" },
];

export default function AdminPage() {
  const { toast } = useDesignSystem();
  const { auth } = useAppState();

  const perms = new Set(auth?.effectivePermissions ?? []);
  const role = auth?.user?.role ?? "user";
  const isStaff =
    role === "moderator" || role === "admin" || role === "super_admin";

  const canReadReports =
    role === "super_admin" || perms.has("mod:reports:read");
  const canResolveReports =
    role === "super_admin" || perms.has("mod:reports:resolve");
  const canDeleteComment =
    role === "super_admin" || perms.has("mod:comment:delete");
  const canWarnUser = role === "super_admin" || perms.has("mod:user:warn");
  const canMuteOrSuspend =
    role === "super_admin" ||
    perms.has("mod:user:mute") ||
    perms.has("mod:user:suspend");
  const canBanUser = role === "super_admin" || perms.has("admin:user:ban");
  const canAssignRole =
    role === "super_admin" || perms.has("admin:role:assign");
  const canGrantAdminPerms = role === "super_admin";
  const canReadFlags = role === "super_admin" || perms.has("mod:flags:read");
  const canResolveFlags =
    role === "super_admin" || perms.has("mod:flags:resolve");
  const canReadAppeals =
    role === "super_admin" || perms.has("mod:appeals:read");
  const canResolveAppeals =
    role === "super_admin" || perms.has("mod:appeals:resolve");
  const canSendAnnouncements =
    role === "super_admin" || perms.has("admin:announcement:send");
  const canReadAudit =
    role === "super_admin" || perms.has("admin:audit:read");

  const [tab, setTab] = useState("reports");

  const [reports, setReports] = useState<ModReportItem[]>([]);
  const [flags, setFlags] = useState<ModFlagItem[]>([]);
  const [appeals, setAppeals] = useState<ModAppealItem[]>([]);
  const [usersList, setUsersList] = useState<GovernanceUserItem[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // Action modal state for reason + human confirmation
  const [decisionReason, setDecisionReason] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [statusModalUser, setStatusModalUser] =
    useState<GovernanceUserItem | null>(null);
  const [statusAction, setStatusAction] = useState<
    "mute" | "suspend" | "ban" | "restore"
  >("mute");
  const [durationHours, setDurationHours] = useState("24");

  // Super Admin delegated permission modal
  const [permModalUser, setPermModalUser] =
    useState<GovernanceUserItem | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [permReason, setPermReason] = useState("");

  // Announcement form
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [sendingAnn, setSendingAnn] = useState(false);

  const loadTab = useCallback(async () => {
    if (!isStaff) return;

    if (tab === "reports") {
      if (canReadReports) {
        const res = await apiClient.getModReports();
        if (res.ok) setReports(res.data.reports);
      }
      if (canReadFlags) {
        const fres = await apiClient.getModFlags();
        if (fres.ok) setFlags(fres.data.flags);
      }
    } else if (tab === "appeals" && canReadAppeals) {
      const res = await apiClient.getModAppeals();
      if (res.ok) setAppeals(res.data.appeals);
    } else if (tab === "users") {
      const res = await apiClient.getGovernanceUsers(userSearch);
      if (res.ok) setUsersList(res.data.users);
    } else if (tab === "audit" && canReadAudit) {
      const res = await apiClient.getAuditLogs();
      if (res.ok) setAuditLogs(res.data.logs);
    }
  }, [
    isStaff,
    tab,
    canReadReports,
    canReadFlags,
    canReadAppeals,
    canReadAudit,
    userSearch,
  ]);

  useEffect(() => {
    void loadTab();
  }, [loadTab]);

  const handleReviewReport = async (
    reportId: string,
    status: "resolved_action" | "resolved_dismissed",
    options?: { deleteComment?: boolean; warnAuthor?: boolean }
  ) => {
    const reason =
      status === "resolved_dismissed"
        ? "Qoidabuzarlik aniqlanmadi"
        : "Shikoyat bo‘yicha chora ko‘rildi";
    const res = await apiClient.reviewModReport(reportId, {
      status,
      reason,
      deleteComment: options?.deleteComment,
      warnAuthor: options?.warnAuthor,
    });
    if (res.ok) {
      toast({ title: "Shikoyat ko‘rib chiqildi", variant: "success" });
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleReviewFlag = async (
    flagId: string,
    status: "reviewed_safe" | "reviewed_action"
  ) => {
    const res = await apiClient.reviewModFlag(flagId, {
      status,
      reason:
        status === "reviewed_safe"
          ? "Kontent tekshirildi — xavfsiz"
          : "Avto-signal bo‘yicha ogohlantirish berildi",
      warnAuthor: status === "reviewed_action",
    });
    if (res.ok) {
      toast({ title: "Avto-tekshiruv qarori saqlandi", variant: "success" });
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleApplyStatusAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalUser || !humanConfirmed) return;
    const res = await apiClient.moderateUserStatus(statusModalUser.userId, {
      action: statusAction,
      reason: decisionReason.trim(),
      durationHours:
        statusAction === "mute" || statusAction === "suspend"
          ? Number(durationHours) || 24
          : undefined,
      humanConfirmed: true,
    });
    if (res.ok) {
      toast({ title: "Foydalanuvchi holati yangilandi", variant: "success" });
      setStatusModalUser(null);
      setDecisionReason("");
      setHumanConfirmed(false);
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleRoleChange = async (
    targetUserId: string,
    nextRole: "user" | "moderator" | "admin"
  ) => {
    const res = await apiClient.assignUserRole(
      targetUserId,
      nextRole,
      `Boshqaruv paneli orqali ${nextRole} roli tayinlandi`
    );
    if (res.ok) {
      toast({ title: `Rol ${nextRole} ga o‘zgartirildi`, variant: "success" });
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleSaveDelegatedPerms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permModalUser) return;
    const res = await apiClient.setAdminPermissions(
      permModalUser.userId,
      selectedPerms,
      permReason.trim() || "Super Admin vakolatlarni yangiladi"
    );
    if (res.ok) {
      toast({ title: "Admin vakolatlari yangilandi", variant: "success" });
      setPermModalUser(null);
      setPermReason("");
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleReviewAppeal = async (
    appealId: string,
    decision: "approved" | "rejected"
  ) => {
    const res = await apiClient.reviewModAppeal(appealId, {
      decision,
      reason:
        decision === "approved"
          ? "Apellyatsiya o‘rinli deb topildi va holat tiklandi"
          : "Qoidabuzarlik tasdiqlanganligi sababli rad etildi",
      humanConfirmed: true,
    });
    if (res.ok) {
      toast({ title: "Apellyatsiya ko‘rib chiqildi", variant: "success" });
      await loadTab();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingAnn(true);
    try {
      const res = await apiClient.sendAnnouncement(annTitle.trim(), annBody.trim());
      if (res.ok) {
        toast({
          title: `E’lon yuborildi (${res.data.announcement.deliveredCount} foydalanuvchi)`,
          variant: "success",
        });
        setAnnTitle("");
        setAnnBody("");
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSendingAnn(false);
    }
  };

  if (!auth?.user || !isStaff) {
    return (
      <AppShell title="Boshqaruv">
        <GlassCard padding="lg" className="text-center space-y-2">
          <Shield className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[17px] font-semibold text-[var(--text-primary)]"
          >
            Kirish cheklangan
          </h1>
          <p className="text-[13.5px] text-[var(--text-secondary)]">
            Ushbu bo‘lim faqat Moderator, Admin va Super Admin hisoblari uchun ochiq.
          </p>
        </GlassCard>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Boshqaruv paneli"
      topAction={
        <GlassBadge variant="accent">
          {role === "super_admin"
            ? "Super Admin"
            : role === "admin"
              ? "Admin"
              : "Moderator"}
        </GlassBadge>
      }
    >
      <div className="space-y-4">
        <GlassTabs
          value={tab}
          onValueChange={setTab}
          ariaLabel="Boshqaruv bo‘limlari"
          fullWidth
        >
          <GlassTab value="reports">Shikoyatlar</GlassTab>
          <GlassTab value="appeals">Apellyatsiya</GlassTab>
          <GlassTab value="users">Foydalanuvchilar</GlassTab>
          {canSendAnnouncements ? (
            <GlassTab value="announcements">E’lon</GlassTab>
          ) : null}
          {canReadAudit ? <GlassTab value="audit">Audit Log</GlassTab> : null}
        </GlassTabs>

        {/* 1. Reports & Automated Content Moderation Flags */}
        {tab === "reports" ? (
          <div className="space-y-4">
            <GlassCard padding="md" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                  <Flag className="h-4 w-4 text-amber-400" />
                  Izoh shikoyatlari
                </h2>
                <GlassBadge variant="matte">{reports.length}</GlassBadge>
              </div>
              {!canReadReports ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Shikoyatlarni ko‘rish vakolati berilmagan.
                </p>
              ) : reports.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Hozircha shikoyatlar yo‘q.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="rounded-2xl border border-[var(--border-matte)] bg-[var(--surface-input)] p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                        <span className="font-mono text-[var(--text-secondary)]">
                          @{rep.reporterUsername} → @
                          {rep.commentAuthorUsername ?? "noma’lum"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <GlassBadge variant="accent">
                            {rep.reasonCode}
                          </GlassBadge>
                          <GlassBadge variant="matte">{rep.status}</GlassBadge>
                        </div>
                      </div>
                      <p className="text-[13.5px] text-[var(--text-primary)]">
                        {rep.commentBody}
                      </p>
                      {rep.details ? (
                        <p className="text-[12px] text-[var(--text-muted)]">
                          Izoh: {rep.details}
                        </p>
                      ) : null}

                      {rep.status === "open" && canResolveReports ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {canDeleteComment ? (
                            <GlassButton
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                void handleReviewReport(
                                  rep.id,
                                  "resolved_action",
                                  {
                                    deleteComment: true,
                                    warnAuthor: canWarnUser,
                                  }
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Izohni o‘chirish
                            </GlassButton>
                          ) : null}
                          <GlassButton
                            size="sm"
                            variant="subtle"
                            onClick={() =>
                              void handleReviewReport(
                                rep.id,
                                "resolved_dismissed"
                              )
                            }
                          >
                            Rad etish
                          </GlassButton>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {canReadFlags ? (
              <GlassCard padding="md" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    Avtomatik kontent tekshiruvi
                  </h2>
                  <GlassBadge variant="matte">{flags.length}</GlassBadge>
                </div>
                {flags.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    Avto-tekshiruv signallari topilmadi.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {flags.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-2xl border border-[var(--border-matte)] p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-mono text-[var(--text-secondary)]">
                            @{f.authorUsername} · {f.contentType}
                          </span>
                          <GlassBadge
                            variant={
                              f.severity === "high" ? "accent" : "matte"
                            }
                          >
                            {f.severity} · {f.status}
                          </GlassBadge>
                        </div>
                        <p className="text-[13.5px] text-[var(--text-primary)]">
                          {f.excerpt}
                        </p>
                        <p className="text-[12px] text-[var(--text-muted)]">
                          Sabab: {f.reasons.join(", ")}
                        </p>
                        {f.status === "open" && canResolveFlags ? (
                          <div className="flex gap-2 pt-1">
                            <GlassButton
                              size="sm"
                              variant="subtle"
                              onClick={() =>
                                void handleReviewFlag(f.id, "reviewed_safe")
                              }
                            >
                              Xavfsiz
                            </GlassButton>
                            <GlassButton
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                void handleReviewFlag(f.id, "reviewed_action")
                              }
                            >
                              Ogohlantirish
                            </GlassButton>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            ) : null}
          </div>
        ) : null}

        {/* 2. Appeals */}
        {tab === "appeals" ? (
          <GlassCard padding="md" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                <Scale className="h-4 w-4 text-sky-400" />
                Apellyatsiyalar
              </h2>
              <GlassBadge variant="matte">{appeals.length}</GlassBadge>
            </div>
            {!canReadAppeals ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                Apellyatsiyalarni ko‘rish ruxsati yo‘q.
              </p>
            ) : appeals.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                Apellyatsiyalar yo‘q.
              </p>
            ) : (
              <div className="space-y-2.5">
                {appeals.map((ap) => (
                  <div
                    key={ap.id}
                    className="rounded-2xl border border-[var(--border-matte)] p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-mono font-semibold text-[var(--text-primary)]">
                        @{ap.username} ({ap.actionType})
                      </span>
                      <GlassBadge variant="matte">{ap.status}</GlassBadge>
                    </div>
                    <p className="text-[13.5px] text-[var(--text-secondary)]">
                      {ap.reason}
                    </p>
                    {ap.status === "pending" && canResolveAppeals ? (
                      <div className="flex gap-2 pt-1">
                        <GlassButton
                          size="sm"
                          variant="glass"
                          onClick={() =>
                            void handleReviewAppeal(ap.id, "approved")
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Tasdiqlash va tiklash
                        </GlassButton>
                        <GlassButton
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            void handleReviewAppeal(ap.id, "rejected")
                          }
                        >
                          Rad etish
                        </GlassButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ) : null}

        {/* 3. Users, Roles & Super Admin Permission Delegation */}
        {tab === "users" ? (
          <GlassCard padding="md" className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-400" />
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Foydalanuvchilar va Vakolatlar
              </h2>
            </div>

            <div className="flex gap-2">
              <GlassInput
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Username bo‘yicha qidirish..."
                leadingIcon={<Search className="h-4 w-4" />}
              />
              <GlassButton variant="subtle" onClick={() => void loadTab()}>
                Qidirish
              </GlassButton>
            </div>

            <div className="space-y-2.5">
              {usersList.map((u) => (
                <div
                  key={u.userId}
                  className="rounded-2xl border border-[var(--border-matte)] bg-[var(--surface-input)] p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                        {u.displayName}
                      </div>
                      <div className="font-mono text-[11.5px] text-[var(--text-muted)]">
                        @{u.username}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GlassBadge variant="accent">{u.role}</GlassBadge>
                      <GlassBadge
                        variant={u.status === "active" ? "success" : "matte"}
                      >
                        {u.status}
                      </GlassBadge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(canMuteOrSuspend || canBanUser) &&
                    u.userId !== auth.user?.id &&
                    u.role !== "super_admin" ? (
                      <GlassButton
                        size="sm"
                        variant="subtle"
                        onClick={() => {
                          setStatusModalUser(u);
                          setStatusAction("mute");
                          setDecisionReason("");
                          setHumanConfirmed(false);
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Cheklov / Holat
                      </GlassButton>
                    ) : null}

                    {canAssignRole &&
                    u.userId !== auth.user?.id &&
                    u.role !== "super_admin" ? (
                      <>
                        {u.role !== "moderator" ? (
                          <GlassButton
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void handleRoleChange(u.userId, "moderator")
                            }
                          >
                            Moderator qilish
                          </GlassButton>
                        ) : (
                          <GlassButton
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void handleRoleChange(u.userId, "user")
                            }
                          >
                            User qilish
                          </GlassButton>
                        )}
                        {role === "super_admin" && u.role !== "admin" ? (
                          <GlassButton
                            size="sm"
                            variant="glass"
                            onClick={() =>
                              void handleRoleChange(u.userId, "admin")
                            }
                          >
                            Admin tayinlash
                          </GlassButton>
                        ) : null}
                      </>
                    ) : null}

                    {canGrantAdminPerms && u.role === "admin" ? (
                      <GlassButton
                        size="sm"
                        variant="accent"
                        onClick={() => {
                          setPermModalUser(u);
                          setSelectedPerms(u.delegatedPermissions);
                          setPermReason("");
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Vakolatlarni sozlash ({u.delegatedPermissions.length})
                      </GlassButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : null}

        {/* 4. Important Platform Announcements */}
        {tab === "announcements" && canSendAnnouncements ? (
          <GlassCard padding="md">
            <form onSubmit={handleSendAnnouncement} className="space-y-3.5">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-sky-400" />
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Platformaning muhim e’lonini yuborish
                </h2>
              </div>
              <GlassInput
                label="Sarlavha"
                placeholder="Masalan: Xavfsizlik yangilanishi"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                maxLength={100}
              />
              <GlassTextarea
                label="E’lon matni"
                placeholder="Ilova ichida va Telegram bot orqali yuboriladigan xabar..."
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                maxLength={500}
                rows={4}
              />
              <div className="flex justify-end">
                <GlassButton
                  type="submit"
                  variant="glass"
                  loading={sendingAnn}
                  disabled={annTitle.trim().length < 3 || annBody.trim().length < 5}
                >
                  E’lon yuborish
                </GlassButton>
              </div>
            </form>
          </GlassCard>
        ) : null}

        {/* 5. Immutable Audit Logs (Admin / Super Admin ONLY) */}
        {tab === "audit" && canReadAudit ? (
          <GlassCard padding="md" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                <ClipboardList className="h-4 w-4 text-emerald-400" />
                Xavfsizlik va Boshqaruv Audit Logi
              </h2>
              <GlassBadge variant="matte">O‘zgartirib bo‘lmaydi</GlassBadge>
            </div>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-[var(--border-matte)] px-3.5 py-2.5 text-[12.5px] space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      {log.eventType}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[var(--text-secondary)]">
                    Kim:{" "}
                    <span className="font-mono">
                      @{log.actorUsername ?? "system"}
                    </span>{" "}
                    ({log.actorRole ?? "-"})
                    {log.targetUsername || log.targetId ? (
                      <>
                        {" · "}Ta’sir:{" "}
                        <span className="font-mono">
                          {log.targetUsername
                            ? `@${log.targetUsername}`
                            : log.targetId}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {log.reason ? (
                    <div className="text-[12px] text-[var(--text-muted)]">
                      Sabab: {log.reason}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </GlassCard>
        ) : null}
      </div>

      {/* User Status Enforcement Modal (Human Confirmation Required) */}
      <GlassModal
        open={Boolean(statusModalUser)}
        onClose={() => setStatusModalUser(null)}
        title={`@${statusModalUser?.username ?? ""} holatini o‘zgartirish`}
        description="Jiddiy qarorlar uchun sabab va inson tasdiqlashi majburiy."
        footer={
          <>
            <GlassButton
              variant="ghost"
              onClick={() => setStatusModalUser(null)}
            >
              Bekor qilish
            </GlassButton>
            <GlassButton
              variant="danger"
              disabled={!humanConfirmed || decisionReason.trim().length < 5}
              onClick={(e) => void handleApplyStatusAction(e)}
            >
              Tasdiqlash
            </GlassButton>
          </>
        }
      >
        <form onSubmit={handleApplyStatusAction} className="space-y-3.5">
          <GlassSelect
            label="Chora turi"
            value={statusAction}
            onValueChange={(v) =>
              setStatusAction(v as "mute" | "suspend" | "ban" | "restore")
            }
            options={[
              { value: "mute", label: "Vaqtincha mute" },
              { value: "suspend", label: "Vaqtincha to‘xtatish (suspend)" },
              ...(canBanUser
                ? [{ value: "ban", label: "Doimiy ban (Admin/Super Admin)" }]
                : []),
              { value: "restore", label: "Cheklovni olib tashlash (active)" },
            ]}
          />
          {statusAction === "mute" || statusAction === "suspend" ? (
            <GlassInput
              label="Davomiyligi (soat)"
              type="number"
              min={1}
              max={720}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            />
          ) : null}
          <GlassTextarea
            label="Qaror sababi (Audit logga yoziladi)"
            placeholder="Aniq sababni kiriting (kamida 5 belgi)..."
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            rows={3}
          />
          <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={humanConfirmed}
              onChange={(e) => setHumanConfirmed(e.target.checked)}
              className="mt-0.5 accent-sky-400"
            />
            <span>
              Ushbu cheklov qarorini inson sifatida ko‘rib chiqib tasdiqlayman.
            </span>
          </label>
        </form>
      </GlassModal>

      {/* Super Admin: Admin Delegated Permissions Modal */}
      <GlassModal
        open={Boolean(permModalUser)}
        onClose={() => setPermModalUser(null)}
        title={`Admin vakolatlari: @${permModalUser?.username ?? ""}`}
        description="Admin faqat Super Admin bergan vakolatlarga ega bo‘ladi."
        footer={
          <>
            <GlassButton
              variant="ghost"
              onClick={() => setPermModalUser(null)}
            >
              Yopish
            </GlassButton>
            <GlassButton
              variant="glass"
              onClick={(e) => void handleSaveDelegatedPerms(e)}
            >
              Vakolatlarni saqlash
            </GlassButton>
          </>
        }
      >
        <form onSubmit={handleSaveDelegatedPerms} className="space-y-3">
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {ADMIN_DELEGATABLE_LABELS.map((item) => {
              const checked = selectedPerms.includes(item.code);
              return (
                <label
                  key={item.code}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-matte)] px-3 py-2 text-[13px] cursor-pointer"
                >
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPerms((prev) => [...prev, item.code]);
                      } else {
                        setSelectedPerms((prev) =>
                          prev.filter((p) => p !== item.code)
                        );
                      }
                    }}
                    className="accent-sky-400"
                  />
                </label>
              );
            })}
          </div>
          <GlassInput
            label="Sabab"
            placeholder="Vakolat berish/olish sababi..."
            value={permReason}
            onChange={(e) => setPermReason(e.target.value)}
          />
        </form>
      </GlassModal>
    </AppShell>
  );
}
