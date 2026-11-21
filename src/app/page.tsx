"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Feather } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { PostCard } from "@/components/app/post-card";
import {
  GlassButton,
  GlassCard,
  GlassTab,
  GlassTabs,
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
  LIQUID_TAB_SPRING,
  cn,
  triggerHapticSelection,
  useDesignSystem,
} from "@/design-system";
import { POST_TYPES, type PostTypeId } from "@/lib/posts/styles";

const FILTER_CHIPS: Array<{ id: "Bugun" | PostTypeId; label: string }> = [
  { id: "Bugun", label: "Bugun" },
  ...POST_TYPES.map((t) => ({ id: t.id, label: t.shortLabel })),
];

const TRENDING_WINDOWS = [
  { id: "24h" as const, label: "24 soat" },
  { id: "7d" as const, label: "7 kun" },
  { id: "30d" as const, label: "30 kun" },
];

export default function FeedPage() {
  const router = useRouter();
  const { reducedMotion } = useDesignSystem();
  const { auth, posts, feedLoading, loadFeed } = useAppState();

  const [feedTab, setFeedTab] = useState<"for_you" | "following" | "trending">(
    "for_you"
  );
  const [activeFilter, setActiveFilter] = useState<"Bugun" | PostTypeId>(
    "Bugun"
  );
  const [trendingWindow, setTrendingWindow] = useState<"24h" | "7d" | "30d">(
    "7d"
  );

  useEffect(() => {
    void loadFeed({
      tab: feedTab,
      postType: activeFilter === "Bugun" ? undefined : activeFilter,
      window: trendingWindow,
    });
  }, [feedTab, activeFilter, trendingWindow, loadFeed]);

  const displayedPosts = useMemo(() => {
    if (activeFilter === "Bugun") return posts;
    return posts.filter((p) => p.postType === activeFilter);
  }, [posts, activeFilter]);

  return (
    <AppShell
      title="Avero"
      topAction={
        <GlassButton
          size="sm"
          variant="glass"
          onClick={() => router.push("/compose")}
        >
          <Feather className="h-3.5 w-3.5" />
          Yozish
        </GlassButton>
      }
    >
      {/* 3 Main Feed Directions */}
      <div className="mb-3">
        <GlassTabs
          value={feedTab}
          onValueChange={(v) =>
            setFeedTab(v as "for_you" | "following" | "trending")
          }
          ariaLabel="Asosiy lentalar"
          fullWidth
        >
          <GlassTab value="for_you">Siz uchun</GlassTab>
          <GlassTab value="following">Kuzatilayotganlar</GlassTab>
          <GlassTab value="trending">Mashhurlar</GlassTab>
        </GlassTabs>
      </div>

      {/* Single-Row Horizontal Filters — initial active: Bugun */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Post turi filtrlari"
          className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar pb-1"
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.id;
            return (
              <motion.button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                whileTap={reducedMotion ? undefined : LIQUID_BUTTON_TAP}
                transition={LIQUID_BUTTON_SPRING}
                onClick={() => {
                  triggerHapticSelection();
                  setActiveFilter(chip.id);
                }}
                className={cn(
                  "glass-focus-ring relative shrink-0 select-none rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                  isActive
                    ? "text-[var(--text-primary)]"
                    : "border border-[var(--border-matte)] bg-[var(--surface-matte)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="avero-feed-filter-pill"
                    transition={LIQUID_TAB_SPRING}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-[var(--border-matte-hover)] bg-white/[0.09] backdrop-blur-md"
                  />
                ) : null}
                <span className="relative z-10">{chip.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Trending Time Window Selector */}
      {feedTab === "trending" ? (
        <div className="mb-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="mr-1 shrink-0 text-[12px] text-[var(--text-muted)]">
            Vaqt oralig‘i:
          </span>
          {TRENDING_WINDOWS.map((win) => (
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
          <GlassCard padding="lg" className="text-center">
            <p className="text-[14px] text-[var(--text-muted)]">
              Lenta yuklanmoqda...
            </p>
          </GlassCard>
        ) : displayedPosts.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[15px] font-medium text-[var(--text-primary)]">
              {feedTab === "following" && !auth?.user
                ? "Kuzatilayotganlar lentasini ko‘rish uchun tizimga kiring"
                : feedTab === "following"
                  ? "Siz hali birorta muallifni kuzatmayapsiz"
                  : "Hozircha postlar topilmadi"}
            </p>
            <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
              {feedTab === "following"
                ? "Qidiruv bo‘limidan qiziqarli mualliflarni topib obuna bo‘ling."
                : "Birinchi matnli postni yozing."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {feedTab === "following" ? (
                <GlassButton
                  variant="glass"
                  onClick={() => router.push("/search")}
                >
                  Mualliflarni topish
                </GlassButton>
              ) : (
                <GlassButton
                  variant="glass"
                  onClick={() => router.push("/compose")}
                >
                  Post yozish
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
