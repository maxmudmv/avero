"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Feather } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { PostCard } from "@/components/app/post-card";
import {
  GlassButton,
  GlassCard,
  GlassTab,
  GlassTabs,
  cn,
} from "@/design-system";

export default function FeedPage() {
  const router = useRouter();
  const { auth, posts, feedLoading, loadFeed, unreadCount, t } = useAppState();

  const [feedTab, setFeedTab] = useState<"for_you" | "following" | "trending">(
    "for_you"
  );
  const [trendingWindow, setTrendingWindow] = useState<"24h" | "7d" | "30d">(
    "7d"
  );

  useEffect(() => {
    void loadFeed({
      tab: feedTab,
      window: trendingWindow,
    });
  }, [feedTab, trendingWindow, loadFeed]);

  const displayedPosts = posts;
  const trendingWindows = [
    { id: "24h" as const, label: t.feed.h24 },
    { id: "7d" as const, label: t.feed.d7 },
    { id: "30d" as const, label: t.feed.d30 },
  ];

  return (
    <AppShell
      title="Avero"
      topAction={
        <div className="flex items-center gap-2">
          <div className="relative">
            <GlassButton
              size="icon"
              variant="glass"
              aria-label={t.menu.notifications}
              onClick={() => router.push("/notifications")}
              className="h-9 w-9"
            >
              <Bell className="h-4 w-4" />
            </GlassButton>
            {unreadCount > 0 ? (
              <span className="pointer-events-none absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--text-primary)] px-1 text-[10px] font-bold leading-none text-[var(--bg-canvas)]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </div>
          <GlassButton
            size="sm"
            variant="glass"
            onClick={() => router.push("/compose")}
          >
            <Feather className="h-3.5 w-3.5" />
            {t.feed.writeBtn}
          </GlassButton>
        </div>
      }
    >
      {/* 3 Main Feed Directions */}
      <div className="mb-4">
        <GlassTabs
          value={feedTab}
          onValueChange={(v) =>
            setFeedTab(v as "for_you" | "following" | "trending")
          }
          ariaLabel="Feed"
          fullWidth
        >
          <GlassTab value="for_you">{t.feed.forYou}</GlassTab>
          <GlassTab value="following">{t.feed.following}</GlassTab>
          <GlassTab value="trending">{t.feed.trending}</GlassTab>
        </GlassTabs>
      </div>

      {/* Trending Time Window Selector */}
      {feedTab === "trending" ? (
        <div className="mb-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="mr-1 shrink-0 text-[12px] text-[var(--text-muted)]">
            {t.feed.timeRange}
          </span>
          {trendingWindows.map((win) => (
            <button
              key={win.id}
              type="button"
              onClick={() => setTrendingWindow(win.id)}
              className={cn(
                "glass-focus-ring shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer",
                trendingWindow === win.id
                  ? "liquid-glass text-[var(--text-primary)]"
                  : "border border-[var(--border-matte)] text-[var(--text-secondary)]"
              )}
            >
              <span className="relative z-10">{win.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Feed Stream */}
      <div className="space-y-3">
        {feedLoading && displayedPosts.length === 0 ? (
          <div className="space-y-3" aria-label="Loading">
            {[0, 1].map((idx) => (
              <GlassCard key={idx} padding="md" className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
                  <div className="h-3.5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-full animate-pulse rounded-lg bg-white/[0.05]" />
                  <div className="h-3.5 w-4/5 animate-pulse rounded-lg bg-white/[0.05]" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : displayedPosts.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              {feedTab === "following" && !auth?.user
                ? t.feed.emptyFollowingGuest
                : feedTab === "following"
                  ? t.feed.emptyFollowing
                  : t.feed.emptyAll}
            </p>
            <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
              {feedTab === "following"
                ? t.feed.emptyFollowingHint
                : t.feed.emptyAllHint}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {feedTab === "following" ? (
                <GlassButton
                  variant="glass"
                  onClick={() => router.push("/search")}
                >
                  {t.feed.findPeople}
                </GlassButton>
              ) : (
                <GlassButton
                  variant="glass"
                  onClick={() => router.push("/compose")}
                >
                  {t.feed.writePost}
                </GlassButton>
              )}
            </div>
          </GlassCard>
        ) : (
          displayedPosts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </AppShell>
  );
}
