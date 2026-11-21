"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LogIn, Send } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { ProfileView } from "@/components/app/profile-view";
import { useTelegramMiniApp } from "@/components/app/telegram-webapp-provider";
import { GlassButton, GlassCard, useDesignSystem } from "@/design-system";
import {
  apiClient,
  type FollowRequestItem,
  type OwnerActivityResponse,
  type PublicProfileResponse,
} from "@/lib/api-client";

export default function ProfilePage() {
  const { auth, posts, loginWithTelegramNow, t } = useAppState();
  const { isTma, webApp } = useTelegramMiniApp();
  const { toast } = useDesignSystem();
  const [tgLoading, setTgLoading] = useState(false);

  const handleGoogleSignIn = () => {
    const startUrl = `${window.location.origin}/api/v1/auth/google/start`;
    if (isTma && webApp?.openLink) {
      webApp.openLink(startUrl);
      return;
    }
    window.location.href = startUrl;
  };
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
      <AppShell title={t.profile.pageTitle}>
        <div className="space-y-4">
          <GlassCard padding="md" className="space-y-3">
            <p className="text-[13.5px] text-[var(--text-secondary)]">
              {t.profile.guestBanner}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {isTma ? (
                <GlassButton
                  size="sm"
                  variant="glass"
                  loading={tgLoading}
                  onClick={async () => {
                    setTgLoading(true);
                    try {
                      const res = await loginWithTelegramNow();
                      if (res.ok) {
                        toast({
                          title: "Telegram orqali tizimga kirdingiz",
                          variant: "success",
                        });
                      } else {
                        toast({
                          title: res.error ?? "Kirishda xatolik",
                          variant: "error",
                        });
                      }
                    } finally {
                      setTgLoading(false);
                    }
                  }}
                >
                  <Send className="h-3.5 w-3.5 text-sky-400" />
                  Telegram orqali kirish
                </GlassButton>
              ) : null}
              <GlassButton
                size="sm"
                variant="glass"
                onClick={handleGoogleSignIn}
              >
                <LogIn className="h-3.5 w-3.5" />
                Google bilan kirish
              </GlassButton>
            </div>
          </GlassCard>

          <ProfileView profile={guestProfile} isOwner={false} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.profile.pageTitle}>
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
            {t.profile.loading}
          </p>
        </GlassCard>
      )}
    </AppShell>
  );
}
