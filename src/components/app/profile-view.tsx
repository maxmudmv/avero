"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarClock,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Heart,
  Link2,
  Lock,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassModal,
  GlassSelect,
  GlassTab,
  GlassTabs,
  GlassTextarea,
  cn,
  useDesignSystem,
} from "@/design-system";
import {
  apiClient,
  type BlockLevel,
  type FollowRequestItem,
  type OwnerActivityResponse,
  type PublicProfileResponse,
  type ServerPost,
} from "@/lib/api-client";
import {
  AVATAR_CATALOG,
  type AvatarCategory,
} from "@/lib/avatars/catalog";
import { useAppState } from "./app-state-provider";
import { PostCard } from "./post-card";

interface ProfileViewProps {
  profile: PublicProfileResponse;
  isOwner: boolean;
  activity?: OwnerActivityResponse | null;
  followRequests?: FollowRequestItem[];
  onRefresh?: () => Promise<void> | void;
}

export function ProfileView({
  profile,
  isOwner,
  activity,
  followRequests = [],
  onRefresh,
}: ProfileViewProps) {
  const { toast } = useDesignSystem();
  const { auth, refreshAuth } = useAppState();

  const [selectedPost, setSelectedPost] = useState<ServerPost | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Edit Profile + Settings state
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [avatarId, setAvatarId] = useState(profile.avatarId);
  const [avatarTab, setAvatarTab] = useState<"all" | AvatarCategory>("all");
  const [externalLinks, setExternalLinks] = useState<
    Array<{ label: string; url: string }>
  >(profile.externalLinks);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState<"public" | "private">(
    profile.privacyLevel === "private" ? "private" : "public"
  );
  const [autoApproveFollows, setAutoApproveFollows] = useState(
    profile.autoApproveFollows
  );
  const [showOnlineStatus, setShowOnlineStatus] = useState(
    auth?.settings?.showOnlineStatus ?? true
  );
  const [saving, setSaving] = useState(false);

  const [followStatus, setFollowStatus] = useState(profile.followStatus);
  const [followersCount, setFollowersCount] = useState(profile.followersCount);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [myBlockLevel, setMyBlockLevel] = useState<BlockLevel | "none">(
    profile.myBlockLevel ?? "none"
  );
  const [selectedBlockLevel, setSelectedBlockLevel] = useState<BlockLevel>(
    profile.myBlockLevel && profile.myBlockLevel !== "none"
      ? profile.myBlockLevel
      : "dm_only"
  );
  const [savingBlock, setSavingBlock] = useState(false);

  useEffect(() => {
    setUsername(profile.username);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setAvatarId(profile.avatarId);
    setExternalLinks(profile.externalLinks);
    setPrivacyLevel(
      profile.privacyLevel === "private" ? "private" : "public"
    );
    setAutoApproveFollows(profile.autoApproveFollows);
    setFollowStatus(profile.followStatus);
    setFollowersCount(profile.followersCount);
    setMyBlockLevel(profile.myBlockLevel ?? "none");
    if (profile.myBlockLevel && profile.myBlockLevel !== "none") {
      setSelectedBlockLevel(profile.myBlockLevel);
    }
  }, [profile]);

  const unlockedSet = new Set(
    activity?.unlockedAvatars ?? AVATAR_CATALOG.filter((a) => a.starterUnlocked).map((a) => a.id)
  );

  const profileShareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${profile.username}`
      : `/u/${profile.username}`;

  const handleCopyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(profileShareUrl);
      toast({ title: "Profil havolasi nusxalandi", variant: "success" });
    } catch {
      toast({ title: "Havolani nusxalab bo‘lmadi", variant: "warning" });
    }
  };

  const handleSuggestUsernames = async () => {
    const res = await apiClient.getUsernameSuggestions(username || displayName);
    if (res.ok) {
      setSuggestions(res.data.suggestions);
    }
  };

  const handleAddExternalLink = () => {
    if (externalLinks.length >= 4) {
      toast({ title: "Maksimum 4 ta tashqi havola mumkin", variant: "warning" });
      return;
    }
    const label = newLinkLabel.trim();
    const url = newLinkUrl.trim();
    if (!label || !url.startsWith("https://")) {
      toast({
        title: "Nom va https:// bilan boshlanuvchi URL kiriting",
        variant: "warning",
      });
      return;
    }
    setExternalLinks((prev) => [...prev, { label, url }]);
    setNewLinkLabel("");
    setNewLinkUrl("");
  };

  const handleSaveProfileAndSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.user) return;

    setSaving(true);
    try {
      const profileRes = await apiClient.updateProfile({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarId,
        externalLinks,
      });

      if (!profileRes.ok) {
        toast({ title: profileRes.error.message, variant: "error" });
        return;
      }

      const settingsRes = await apiClient.updateSettings({
        privacyLevel,
        autoApproveFollows: privacyLevel === "private" ? false : autoApproveFollows,
        showOnlineStatus,
      });

      if (!settingsRes.ok) {
        toast({ title: settingsRes.error.message, variant: "error" });
        return;
      }

      await refreshAuth();
      await onRefresh?.();
      setEditOpen(false);
      toast({ title: "Profil va sozlamalar saqlandi", variant: "success" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBlock = async () => {
    setSavingBlock(true);
    try {
      const res = await apiClient.blockUser(profile.userId, selectedBlockLevel);
      if (res.ok) {
        setMyBlockLevel(selectedBlockLevel);
        setBlockModalOpen(false);
        toast({ title: "Bloklash darajasi saqlandi", variant: "success" });
        await onRefresh?.();
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSavingBlock(false);
    }
  };

  const handleRemoveBlock = async () => {
    setSavingBlock(true);
    try {
      const res = await apiClient.unblockUser(profile.userId);
      if (res.ok) {
        setMyBlockLevel("none");
        setBlockModalOpen(false);
        toast({ title: "Bloklash olib tashlandi", variant: "success" });
        await onRefresh?.();
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSavingBlock(false);
    }
  };

  const handleFollowAction = async () => {
    if (!auth?.user) {
      toast({
        title: "Kuzatish uchun avval tizimga kiring",
        variant: "warning",
      });
      return;
    }
    const shouldFollow = followStatus === "none";
    const res = await apiClient.followUser(profile.userId, shouldFollow);
    if (res.ok) {
      const prev = followStatus;
      setFollowStatus(res.data.status);
      if (prev !== "following" && res.data.status === "following") {
        setFollowersCount((c) => c + 1);
      } else if (prev === "following" && res.data.status === "none") {
        setFollowersCount((c) => Math.max(0, c - 1));
      }
      toast({
        title:
          res.data.status === "requested"
            ? "Kuzatish so‘rovi yuborildi"
            : res.data.status === "following"
              ? "Obuna bo‘ldingiz"
              : "Bekor qilindi",
        variant: "success",
      });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleRespondRequest = async (
    requestId: string,
    action: "accept" | "decline"
  ) => {
    const res = await apiClient.respondFollowRequest(requestId, action);
    if (res.ok) {
      toast({
        title:
          action === "accept" ? "So‘rov tasdiqlandi" : "So‘rov rad etildi",
        variant: "success",
      });
      await onRefresh?.();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const filteredAvatars =
    avatarTab === "all"
      ? AVATAR_CATALOG
      : AVATAR_CATALOG.filter((a) => a.category === avatarTab);

  return (
    <div className="space-y-4">
      {/* Minimalist Profile Header */}
      <GlassCard padding="lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <GlassAvatar
              name={profile.displayName}
              avatarId={profile.avatarId}
              online={profile.online}
              size="xl"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  style={{ fontFamily: "var(--font-display)" }}
                  className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  {profile.displayName}
                </h1>
                {profile.badges.map((b) => (
                  <GlassBadge key={b.id} variant={b.tone}>
                    {b.label}
                  </GlassBadge>
                ))}
              </div>
              <p className="font-mono text-[13px] text-[var(--text-muted)]">
                @{profile.username}
                {profile.online ? (
                  <span className="ml-2 text-emerald-400">● Onlayn</span>
                ) : null}
              </p>

              {profile.bio ? (
                <p className="mt-2.5 max-w-lg whitespace-pre-wrap text-[14.5px] leading-[1.55] text-[var(--text-secondary)]">
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <GlassButton
              size="sm"
              variant="subtle"
              aria-label="Profil havolasini nusxalash"
              onClick={() => void handleCopyProfileLink()}
            >
              <Copy className="h-3.5 w-3.5" />
              Havola
            </GlassButton>

            {isOwner && auth?.user ? (
              <GlassButton
                size="sm"
                variant="glass"
                onClick={() => setEditOpen(true)}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Sozlash
              </GlassButton>
            ) : !isOwner ? (
              <>
                <GlassButton
                  size="sm"
                  variant={followStatus === "none" ? "glass" : "subtle"}
                  onClick={() => void handleFollowAction()}
                >
                  {followStatus === "following" ? (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Kuzatilmoqda
                    </>
                  ) : followStatus === "requested" ? (
                    <>
                      <CalendarClock className="h-3.5 w-3.5" />
                      So‘rov yuborildi
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      {profile.privacyLevel === "private" ||
                      !profile.autoApproveFollows
                        ? "So‘rov yuborish"
                        : "Kuzatish"}
                    </>
                  )}
                </GlassButton>

                {auth?.user ? (
                  <>
                    <Link
                      href={`/messages?to=${encodeURIComponent(profile.userId)}&username=${encodeURIComponent(profile.username)}&name=${encodeURIComponent(profile.displayName)}`}
                      className="liquid-glass glass-focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-medium text-[var(--text-primary)]"
                    >
                      <MessageSquare className="relative z-10 h-3.5 w-3.5" />
                      <span className="relative z-10">Xabar</span>
                    </Link>

                    <GlassButton
                      size="sm"
                      variant={myBlockLevel === "none" ? "ghost" : "danger"}
                      aria-label="Foydalanuvchini bloklash"
                      onClick={() => setBlockModalOpen(true)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {myBlockLevel === "none" ? "Cheklash" : "Bloklangan"}
                    </GlassButton>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* External Links */}
        {profile.externalLinks.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.externalLinks.map((lnk, idx) => (
              <a
                key={`${lnk.url}_${idx}`}
                href={lnk.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="glass-focus-ring inline-flex items-center gap-1.5 rounded-full border border-[var(--border-matte)] bg-[var(--surface-input)] px-3 py-1 text-[12.5px] text-sky-500 hover:text-sky-400 dark:text-sky-300"
              >
                <Link2 className="h-3 w-3" />
                <span>{lnk.label}</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            ))}
          </div>
        ) : null}

        {/* Stats Row */}
        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-[var(--border-matte)] pt-4 text-[13.5px]">
          <div>
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {profile.postsCount}
            </span>{" "}
            <span className="text-[var(--text-muted)]">Post</span>
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {followersCount}
            </span>{" "}
            <span className="text-[var(--text-muted)]">Followers</span>
          </div>
          <div>
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {profile.followingCount}
            </span>{" "}
            <span className="text-[var(--text-muted)]">Following</span>
          </div>
          {isOwner && activity ? (
            <div>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {activity.unlockedAvatars.length}/30
              </span>{" "}
              <span className="text-[var(--text-muted)]">Ochilgan avatarlar</span>
            </div>
          ) : null}
        </div>
      </GlassCard>

      {/* Owner-Only Daily Activity & Avatar Unlock Card (Strictly hidden from other users) */}
      {isOwner && activity ? (
        <GlassCard padding="md" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-4 w-4 text-sky-400" />
              Kunlik faollik va avatarlar
            </span>
            <GlassBadge variant="success">
              {activity.activeDaysCount ?? 1}-faol kun
            </GlassBadge>
          </div>
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            Har faol bo‘lgan kuningizda 1 tadan yangi avatar avtomatik ochilib
            boradi. (Faqat sizga ko‘rinadi)
          </p>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="rounded-2xl border border-[var(--border-matte)] p-2.5">
              <div className="font-mono text-[15px] font-bold text-[var(--text-primary)]">
                {activity.activeDaysCount ?? 1} kun
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Faol kunlar
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-matte)] p-2.5">
              <div className="font-mono text-[15px] font-bold text-[var(--text-primary)]">
                {activity.accountAgeDays} kun
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Profil yoshi
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border-matte)] p-2.5">
              <div className="font-mono text-[15px] font-bold text-[var(--text-primary)]">
                {activity.unlockedAvatars.length}/30
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Avatarlar
              </div>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {/* Owner-Only Incoming Follow Requests */}
      {isOwner && followRequests.length > 0 ? (
        <GlassCard padding="md" className="space-y-3">
          <h2 className="text-[14.5px] font-semibold text-[var(--text-primary)]">
            Kuzatish so‘rovlari ({followRequests.length})
          </h2>
          <div className="space-y-2">
            {followRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-matte)] p-3"
              >
                <div className="flex items-center gap-2.5">
                  <GlassAvatar
                    name={req.requesterDisplayName}
                    avatarId={req.requesterAvatarId}
                    size="sm"
                  />
                  <div>
                    <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                      {req.requesterDisplayName}
                    </div>
                    <div className="font-mono text-[11.5px] text-[var(--text-muted)]">
                      @{req.requesterUsername}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <GlassButton
                    size="sm"
                    variant="glass"
                    onClick={() => void handleRespondRequest(req.id, "accept")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Tasdiqlash
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRespondRequest(req.id, "decline")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </GlassButton>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Instagram-style 3-Column Text Post Grid */}
      <section aria-label="Postlar to‘ri">
        {profile.contentBlocked ? (
          <GlassCard padding="lg" className="text-center space-y-1.5">
            <p className="text-[14.5px] font-medium text-[var(--text-primary)]">
              Kontent cheklangan
            </p>
            <p className="text-[13px] text-[var(--text-muted)]">
              Bloklash darajasi tufayli ushbu profil postlari va o‘zaro amallar ko‘rsatilmaydi.
            </p>
          </GlassCard>
        ) : profile.posts.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[14.5px] text-[var(--text-secondary)]">
              Hali chop etilgan matnli postlar yo‘q.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {profile.posts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedPost(post)}
                className="glass-focus-ring oled-matte-card group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl p-2.5 text-left transition-transform hover:scale-[1.01] cursor-pointer"
              >
                <p className="line-clamp-5 text-[11.5px] leading-snug text-[var(--text-primary)] sm:text-[12.5px]">
                  {post.body}
                </p>

                <div className="flex items-center justify-between font-mono text-[10px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-0.5">
                    <Heart className="h-2.5 w-2.5" />
                    {post.likesCount}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Eye className="h-2.5 w-2.5" />
                    {post.viewsCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Full Post Modal on Grid Cell Click */}
      <GlassModal
        open={Boolean(selectedPost)}
        onClose={() => setSelectedPost(null)}
        title={selectedPost ? `@${selectedPost.authorUsername}` : "Post"}
        size="lg"
      >
        {selectedPost ? <PostCard post={selectedPost} /> : null}
      </GlassModal>

      {/* Owner Profile Settings + 30-Avatar Picker Modal */}
      {isOwner ? (
        <GlassModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Profil sozlamalari"
          description="Avatar almashtirish, bio, tashqi havolalar va kuzatish tartibi."
          size="lg"
          footer={
            <>
              <GlassButton variant="ghost" onClick={() => setEditOpen(false)}>
                Bekor qilish
              </GlassButton>
              <GlassButton
                variant="glass"
                loading={saving}
                onClick={(e) => void handleSaveProfileAndSettings(e)}
              >
                Saqlash
              </GlassButton>
            </>
          }
        >
          <form onSubmit={handleSaveProfileAndSettings} className="space-y-5">
            {/* Username + Automatic Suggestions */}
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <GlassInput
                  label="Username (5–20 belgi: a-z, 0-9, ., _)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  maxLength={20}
                />
                <GlassButton
                  type="button"
                  variant="subtle"
                  size="sm"
                  onClick={() => void handleSuggestUsernames()}
                  className="h-11 shrink-0"
                >
                  Takliflar
                </GlassButton>
              </div>
              {suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setUsername(s)}
                      className="rounded-full border border-[var(--border-matte)] px-2.5 py-0.5 font-mono text-[11.5px] text-sky-400 hover:bg-[var(--glass-fill-subtle)] cursor-pointer"
                    >
                      @{s}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <GlassInput
              label="Ko‘rinadigan ism (1–40 belgi)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />

            <GlassTextarea
              label="Bio (maksimum 150 belgi)"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={150}
              rows={3}
            />

            {/* 30 Built-In Avatars Picker (No Uploads) */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  Tayyor avatarlar (30 ta — yuklash taqiqlangan)
                </span>
                <GlassTabs
                  value={avatarTab}
                  onValueChange={(v) =>
                    setAvatarTab(v as "all" | AvatarCategory)
                  }
                  ariaLabel="Avatar turlari"
                >
                  <GlassTab value="all">Hammasi</GlassTab>
                  <GlassTab value="illustration">Illustration</GlassTab>
                  <GlassTab value="abstract">Abstract</GlassTab>
                  <GlassTab value="minimal">Minimal</GlassTab>
                </GlassTabs>
              </div>

              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {filteredAvatars.map((item) => {
                  const unlocked = unlockedSet.has(item.id);
                  const selected = avatarId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!unlocked}
                      title={
                        unlocked
                          ? item.name
                          : `${item.name} — Qulflangan: ${item.unlockRequirementText}`
                      }
                      onClick={() => setAvatarId(item.id)}
                      className={cn(
                        "glass-focus-ring relative flex flex-col items-center gap-1 rounded-2xl border p-2 transition-colors",
                        selected
                          ? "liquid-glass border-sky-400/60"
                          : "border-[var(--border-matte)]",
                        unlocked
                          ? "cursor-pointer hover:bg-[var(--glass-fill-subtle)]"
                          : "cursor-not-allowed opacity-45"
                      )}
                    >
                      <GlassAvatar
                        name={item.name}
                        avatarId={item.id}
                        size="sm"
                      />
                      <span className="w-full truncate text-center text-[10px] text-[var(--text-muted)]">
                        {item.name}
                      </span>
                      {!unlocked ? (
                        <Lock
                          aria-hidden="true"
                          className="absolute right-1.5 top-1.5 h-3 w-3 text-[var(--text-muted)]"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* External Links Manager */}
            <div className="space-y-2.5">
              <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                Tashqi havolalar ({externalLinks.length}/4)
              </span>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <GlassInput
                  placeholder="Nomi (masalan: Telegram)"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  maxLength={32}
                />
                <GlassInput
                  placeholder="https://t.me/username"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                />
                <GlassButton
                  type="button"
                  variant="subtle"
                  size="icon"
                  aria-label="Havola qo‘shish"
                  onClick={handleAddExternalLink}
                  className="h-11 w-11"
                >
                  <Plus className="h-4 w-4" />
                </GlassButton>
              </div>
              {externalLinks.map((lnk, idx) => (
                <div
                  key={`${lnk.url}_${idx}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--border-matte)] px-3 py-2 text-[12.5px]"
                >
                  <span className="truncate">
                    <strong>{lnk.label}:</strong> {lnk.url}
                  </span>
                  <button
                    type="button"
                    aria-label="Havolani o‘chirish"
                    onClick={() =>
                      setExternalLinks((prev) =>
                        prev.filter((_, i) => i !== idx)
                      )
                    }
                    className="text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Privacy & Online Status */}
            <div className="space-y-3 border-t border-[var(--border-matte)] pt-4">
              <GlassSelect
                label="Kuzatish maxfiyligi (Postlar va profil hamma uchun ochiq qoladi)"
                value={privacyLevel}
                onValueChange={(v) => setPrivacyLevel(v as "public" | "private")}
                options={[
                  {
                    value: "public",
                    label: "Public (Ochiq kuzatish)",
                    description: "Istalgan foydalanuvchi darhol kuzata oladi",
                  },
                  {
                    value: "private",
                    label: "Private (So‘rov bilan kuzatish)",
                    description: "Kuzatish so‘rovlarini siz tasdiqlaysiz",
                  },
                ]}
              />

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-matte)] px-4 py-3 text-[13.5px] cursor-pointer">
                <span>Onlayn holatini ko‘rsatish</span>
                <input
                  type="checkbox"
                  checked={showOnlineStatus}
                  onChange={(e) => setShowOnlineStatus(e.target.checked)}
                  className="accent-sky-400"
                />
              </label>
            </div>
          </form>
        </GlassModal>
      ) : null}

      {/* Granular Block Level Modal */}
      {!isOwner && auth?.user ? (
        <GlassModal
          open={blockModalOpen}
          onClose={() => setBlockModalOpen(false)}
          title={`@${profile.username} ni cheklash`}
          description="Kerakli bloklash darajasini tanlang."
          footer={
            <>
              {myBlockLevel !== "none" ? (
                <GlassButton
                  variant="ghost"
                  loading={savingBlock}
                  onClick={() => void handleRemoveBlock()}
                >
                  Blokni olib tashlash
                </GlassButton>
              ) : null}
              <GlassButton
                variant="danger"
                loading={savingBlock}
                onClick={() => void handleSaveBlock()}
              >
                Saqlash
              </GlassButton>
            </>
          }
        >
          <div className="space-y-3">
            <GlassSelect
              label="Bloklash darajasi"
              value={selectedBlockLevel}
              onValueChange={(v) => setSelectedBlockLevel(v as BlockLevel)}
              options={[
                {
                  value: "dm_only",
                  label: "Faqat DMni cheklash",
                  description: "Shaxsiy xabarlar yubora olmaydi",
                },
                {
                  value: "follow_only",
                  label: "Kuzatishni cheklash",
                  description: "Obuna bo‘lish va kuzatish so‘rovlarini to‘xtatadi",
                },
                {
                  value: "content_only",
                  label: "Kontentni ko‘rishni cheklash",
                  description: "Postlar, izohlar, like va @belgilashni yopadi",
                },
                {
                  value: "full",
                  label: "To‘liq bloklash",
                  description: "DM, kuzatish va barcha kontent amallarini to‘liq yopadi",
                },
              ]}
            />
          </div>
        </GlassModal>
      ) : null}
    </div>
  );
}
