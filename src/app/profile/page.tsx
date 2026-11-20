"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { ProfileView } from "@/components/app/profile-view";
import { GlassCard } from "@/design-system";
import {
  apiClient,
  type FollowRequestItem,
  type OwnerActivityResponse,
  type PublicProfileResponse,
} from "@/lib/api-client";

export default function ProfilePage() {
  const { auth, posts } = useAppState();
  const [dashboard, setDashboard] = useState<{
    profile: PublicProfileResponse;
    activity: OwnerActivityResponse;
    followRequests: FollowRequestItem[];
  } | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!auth?.user) {
      setDashboard(null);
      return;
    }
    const res = await apiClient.getOwnProfileDashboard();
    if (res.ok) {
      setDashboard(res.data);
    }
  }, [auth?.user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!auth?.user) {
    const guestProfile: PublicProfileResponse = {
      userId: "guest",
      username: "guest_user",
      displayName: "Mehmon Foydalanuvchi",
      bio: "Google yoki Telegram orqali kirib, o‘z profilingizni, 30 ta avatarni va kuzatish tizimini boshqaring.",
      avatarId: "av_01",
      externalLinks: [],
      followersCount: 0,
      followingCount: 0,
      postsCount: posts.length,
      badges: [{ id: "guest", label: "Mehmon", tone: "matte" }],
      privacyLevel: "public",
      autoApproveFollows: true,
      online: false,
      followStatus: "self",
      createdAt: new Date().toISOString(),
      posts: posts.slice(0, 6),
    };

    return (
      <AppShell title="Profil">
        <div className="space-y-4">
          <GlassCard padding="md" className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] text-[var(--text-secondary)]">
              Shaxsiy profil, 3 kunlik faollik va avatarlarni ochish uchun kiring.
            </p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/v1/auth/google/start"
              className="liquid-glass glass-focus-ring inline-flex h-9 shrink-0 items-center rounded-2xl px-4 text-[13px] font-medium text-[var(--text-primary)]"
            >
              <span className="relative z-10">Google bilan kirish</span>
            </a>
          </GlassCard>

          <ProfileView profile={guestProfile} isOwner={false} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profil">
      {dashboard ? (
        <ProfileView
          profile={dashboard.profile}
          isOwner={true}
          activity={dashboard.activity}
          followRequests={dashboard.followRequests}
          onRefresh={loadDashboard}
        />
      ) : (
        <GlassCard padding="lg" className="text-center">
          <p className="text-[14px] text-[var(--text-muted)]">
            Profil yuklanmoqda...
          </p>
        </GlassCard>
      )}
    </AppShell>
  );
}
