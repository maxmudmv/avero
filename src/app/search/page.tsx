"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search as SearchIcon, ShieldCheck, UserPlus, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { PostCard } from "@/components/app/post-card";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  useDesignSystem,
} from "@/design-system";
import {
  apiClient,
  type ServerPost,
  type ServerSearchResults,
} from "@/lib/api-client";

function sortByPopularity(list: ServerPost[]): ServerPost[] {
  return [...list].sort((a, b) => {
    const scoreA =
      a.viewsCount + a.likesCount * 3 + a.commentsCount * 4 + a.repostsCount * 4;
    const scoreB =
      b.viewsCount + b.likesCount * 3 + b.commentsCount * 4 + b.repostsCount * 4;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useDesignSystem();
  const { auth, t } = useAppState();

  const initialTag = searchParams.get("tag") ?? "";
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [loading, setLoading] = useState(true);
  const [popularPosts, setPopularPosts] = useState<ServerPost[]>([]);
  const [results, setResults] = useState<ServerSearchResults>({
    users: [],
    hashtags: [],
    posts: [],
  });
  const [followStates, setFollowStates] = useState<
    Record<string, "following" | "requested" | "none">
  >({});

  useEffect(() => {
    setActiveTag(searchParams.get("tag") ?? "");
  }, [searchParams]);

  const isSearching = query.trim().length > 0 || activeTag.length > 0;

  // Load most popular / most viewed posts by default; run search when query or #tag is entered
  useEffect(() => {
    let cancelled = false;

    if (!isSearching) {
      setLoading(true);
      void (async () => {
        try {
          const trendingRes = await apiClient.getFeed({
            tab: "trending",
            window: "30d",
            limit: 30,
          });
          if (!cancelled && trendingRes.ok && trendingRes.data.posts.length > 0) {
            setPopularPosts(sortByPopularity(trendingRes.data.posts));
            return;
          }
          const fallbackRes = await apiClient.getFeed({
            tab: "for_you",
            limit: 30,
          });
          if (!cancelled && fallbackRes.ok) {
            setPopularPosts(sortByPopularity(fallbackRes.data.posts));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient.search({
          q: query,
          type: "all",
          tag: activeTag || undefined,
          limit: 25,
        });
        if (!cancelled && res.ok) {
          setResults(res.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, activeTag, isSearching]);

  const handleFollowToggle = async (userId: string) => {
    if (!auth?.user) {
      toast({
        title: t.auth.signIn,
        variant: "warning",
      });
      return;
    }
    const current = followStates[userId] ?? "none";
    const shouldFollow = current === "none";
    const res = await apiClient.followUser(userId, shouldFollow);
    if (res.ok) {
      setFollowStates((prev) => ({ ...prev, [userId]: res.data.status }));
      toast({
        title:
          res.data.status === "requested"
            ? t.search.requested
            : res.data.status === "following"
              ? t.search.following
              : t.auth.cancel,
        variant: "success",
      });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  return (
    <div className="space-y-4">
      <GlassInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.search.placeholder}
        aria-label={t.search.pageTitle}
        leadingIcon={<SearchIcon className="h-4 w-4" />}
        trailingSlot={
          query ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null
        }
      />

      {activeTag ? (
        <div className="flex items-center gap-2">
          <GlassBadge variant="accent">#{activeTag}</GlassBadge>
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => {
              setActiveTag("");
              router.replace("/search");
            }}
          >
            {t.search.clearFilter}
          </GlassButton>
        </div>
      ) : null}

      {!isSearching ? (
        /* Default Discovery Stream: Most Popular & Most Viewed Posts */
        loading && popularPosts.length === 0 ? (
          <div className="space-y-3">
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
        ) : popularPosts.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[14.5px] text-[var(--text-secondary)]">
              {t.feed.emptyAll}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {popularPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )
      ) : (
        /* Live Search Results */
        <>
          {loading ? (
            <p className="py-2 text-center text-[13px] text-[var(--text-muted)]">
              {t.search.searching}
            </p>
          ) : null}

          {results.hashtags.length > 0 ? (
            <div className="space-y-2">
              <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.search.hashtags}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
                {results.hashtags.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() =>
                      router.push(`/search?tag=${encodeURIComponent(h.tag)}`)
                    }
                    className="glass-focus-ring inline-flex items-center gap-1 rounded-md font-mono text-[13px] font-medium text-sky-400/90 transition-colors hover:text-sky-300 cursor-pointer"
                  >
                    <span>#{h.tag}</span>
                    <span className="text-[11.5px] font-normal text-[var(--text-muted)]">
                      {h.postsCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {results.users.length > 0 ? (
            <div className="space-y-2">
              <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t.search.people}
              </h2>
              {results.users.map((u) => (
                <GlassCard
                  key={u.userId}
                  padding="sm"
                  className="flex items-center justify-between gap-3"
                >
                  <div
                    onClick={() =>
                      router.push(`/u/${encodeURIComponent(u.username)}`)
                    }
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <GlassAvatar
                      name={u.displayName}
                      seed={u.username}
                      avatarId={u.avatarId}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[14px] font-semibold text-[var(--text-primary)] hover:underline">
                          @{u.username}
                        </span>
                        {u.verified ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
                        ) : null}
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {u.displayName} · {u.postsCount} {t.profile.posts.toLowerCase()}
                      </p>
                    </div>
                  </div>
                  {auth?.user?.id !== u.userId ? (
                    <GlassButton
                      size="sm"
                      variant={
                        (followStates[u.userId] ?? "none") === "none"
                          ? "glass"
                          : "subtle"
                      }
                      onClick={() => void handleFollowToggle(u.userId)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {followStates[u.userId] === "following"
                        ? t.search.following
                        : followStates[u.userId] === "requested"
                          ? t.search.requested
                          : t.search.follow}
                    </GlassButton>
                  ) : null}
                </GlassCard>
              ))}
            </div>
          ) : null}

          {results.posts.length > 0 ? (
            <div className="space-y-3">
              {results.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : null}

          {!loading &&
          results.posts.length === 0 &&
          results.users.length === 0 &&
          results.hashtags.length === 0 ? (
            <GlassCard padding="lg" className="text-center">
              <p className="text-[14.5px] text-[var(--text-secondary)]">
                {t.search.noResults}
              </p>
            </GlassCard>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  const { t } = useAppState();
  return (
    <AppShell title={t.search.pageTitle}>
      <Suspense
        fallback={
          <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
            {t.search.searching}
          </p>
        }
      >
        <SearchContent />
      </Suspense>
    </AppShell>
  );
}
