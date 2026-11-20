"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { PostCard } from "@/components/app/post-card";
import { GlassButton, GlassCard } from "@/design-system";
import { apiClient, type ServerPost } from "@/lib/api-client";

export default function BookmarksPage() {
  const router = useRouter();
  const { auth, posts } = useAppState();
  const [serverBookmarks, setServerBookmarks] = useState<ServerPost[] | null>(
    null
  );

  useEffect(() => {
    if (!auth?.user) {
      setServerBookmarks(null);
      return;
    }
    void apiClient.getBookmarks().then((res) => {
      if (res.ok) {
        setServerBookmarks(res.data.posts);
      }
    });
  }, [auth?.user]);

  const saved = serverBookmarks ?? posts.filter((p) => p.bookmarkedByMe);

  return (
    <AppShell title="Saqlanganlar">
      <div className="space-y-3">
        {saved.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              Saqlangan postlar hali yo‘q
            </p>
            <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
              Lentadagi istalgan postni saqlash tugmasi orqali bu yerga
              qo‘shishingiz mumkin.
            </p>
            <div className="mt-4">
              <GlassButton variant="glass" onClick={() => router.push("/")}>
                Lentaga o‘tish
              </GlassButton>
            </div>
          </GlassCard>
        ) : (
          saved.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </AppShell>
  );
}
