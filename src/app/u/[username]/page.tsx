"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { ProfileView } from "@/components/app/profile-view";
import { GlassCard } from "@/design-system";
import { apiClient, type PublicProfileResponse } from "@/lib/api-client";

export default function PublicUserProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? "");
  const { auth } = useAppState();

  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    const res = await apiClient.getPublicProfile(username);
    if (res.ok) {
      setProfile(res.data.profile);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = Boolean(
    auth?.user?.id && profile && auth.user.id === profile.userId
  );

  return (
    <AppShell title={`@${username}`}>
      {notFound ? (
        <GlassCard padding="lg" className="text-center">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            @{username} profili topilmadi
          </p>
        </GlassCard>
      ) : profile ? (
        <ProfileView
          profile={profile}
          isOwner={isOwner}
          onRefresh={load}
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
