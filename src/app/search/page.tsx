"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hash, Search as SearchIcon, ShieldCheck, UserPlus, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { PostCard } from "@/components/app/post-card";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassTab,
  GlassTabs,
  useDesignSystem,
} from "@/design-system";
import { apiClient, type ServerSearchResults } from "@/lib/api-client";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useDesignSystem();
  const { auth, posts: localPosts } = useAppState();
  const localPostsRef = useRef(localPosts);
  localPostsRef.current = localPosts;

  const initialTag = searchParams.get("tag") ?? "";
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [tab, setTab] = useState<"all" | "posts" | "users" | "hashtags">("all");
  const [loading, setLoading] = useState(false);
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

  // All search queries run server-side via GET /api/v1/search
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient.search({
          q: query,
          type: tab,
          tag: activeTag || undefined,
          limit: 25,
        });
        if (!cancelled && res.ok) {
          setResults(res.data);
        } else if (!cancelled && !res.ok) {
          // Graceful local fallback if server DB isn't attached in offline preview
          const q = query.trim().toLowerCase();
          const filtered = localPostsRef.current.filter((p) => {
            if (activeTag) {
              return p.hashtags.includes(activeTag.toLowerCase());
            }
            if (!q) return true;
            return (
              p.body.toLowerCase().includes(q) ||
              p.authorUsername.toLowerCase().includes(q) ||
              p.hashtags.some((t) => t.includes(q.replace(/^#/, "")))
            );
          });
          setResults({ users: [], hashtags: [], posts: filtered });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, tab, activeTag]);

  const handleFollowToggle = async (userId: string) => {
    if (!auth?.user) {
      toast({
        title: "Obuna bo‘lish uchun tizimga kiring",
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

  return (
    <div className="space-y-4">
      <GlassInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Foydalanuvchi, #hashtag yoki post matnini qidiring..."
        aria-label="Qidiruv maydoni"
        leadingIcon={<SearchIcon className="h-4 w-4" />}
        trailingSlot={
          query ? (
            <button
              type="button"
              aria-label="Qidiruvni tozalash"
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
            Filtrni olib tashlash
          </GlassButton>
        </div>
      ) : null}

      <GlassTabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as "all" | "posts" | "users" | "hashtags")
        }
        ariaLabel="Qidiruv turlari"
        fullWidth
      >
        <GlassTab value="all">Barchasi</GlassTab>
        <GlassTab value="posts">Postlar</GlassTab>
        <GlassTab value="users">Mualliflar</GlassTab>
        <GlassTab value="hashtags">Hashtaglar</GlassTab>
      </GlassTabs>

      {loading ? (
        <p className="py-2 text-center text-[13px] text-[var(--text-muted)]">
          Serverdan qidirilmoqda...
        </p>
      ) : null}

      {/* Hashtags section */}
      {(tab === "all" || tab === "hashtags") && results.hashtags.length > 0 ? (
        <div className="space-y-2">
          <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Hashtaglar
          </h2>
          <div className="flex flex-wrap gap-2">
            {results.hashtags.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => router.push(`/search?tag=${encodeURIComponent(h.tag)}`)}
                className="liquid-glass glass-focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[12.5px] text-[var(--text-primary)] cursor-pointer"
              >
                <Hash className="relative z-10 h-3.5 w-3.5 text-sky-400" />
                <span className="relative z-10">{h.tag}</span>
                <span className="relative z-10 text-[11px] text-[var(--text-muted)]">
                  ({h.postsCount})
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Users section */}
      {(tab === "all" || tab === "users") && results.users.length > 0 ? (
        <div className="space-y-2">
          <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Foydalanuvchilar
          </h2>
          {results.users.map((u) => (
            <GlassCard
              key={u.userId}
              padding="sm"
              className="flex items-center justify-between gap-3"
            >
              <div
                onClick={() => router.push(`/u/${encodeURIComponent(u.username)}`)}
                className="flex items-center gap-3 cursor-pointer"
              >
                <GlassAvatar
                  name={u.displayName}
                  seed={u.username}
                  avatarId={u.avatarId}
                  size="md"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14.5px] font-semibold text-[var(--text-primary)] hover:underline">
                      {u.displayName}
                    </span>
                    {u.verified ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
                    ) : null}
                  </div>
                  <p className="font-mono text-[12px] text-[var(--text-muted)]">
                    @{u.username} · {u.postsCount} post · {u.followersCount}{" "}
                    obunachi
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
                    ? "Kuzatilmoqda"
                    : followStates[u.userId] === "requested"
                      ? "So‘rov yuborildi"
                      : "Kuzatish"}
                </GlassButton>
              ) : null}
            </GlassCard>
          ))}
        </div>
      ) : null}

      {/* Posts section */}
      {(tab === "all" || tab === "posts") && results.posts.length > 0 ? (
        <div className="space-y-3">
          <h2 className="px-1 text-[12.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Postlar
          </h2>
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
            Hech qanday natija topilmadi.
          </p>
        </GlassCard>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <AppShell title="Qidiruv">
      <Suspense
        fallback={
          <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
            Qidiruv yuklanmoqda...
          </p>
        }
      >
        <SearchContent />
      </Suspense>
    </AppShell>
  );
}
