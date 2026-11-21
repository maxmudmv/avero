"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PostStyleTokens, PostTypeId } from "@/lib/posts/styles";
import {
  apiClient,
  getTmaSessionToken,
  setTmaSessionToken,
  type AuthMeData,
  type ServerPost,
} from "@/lib/api-client";
import { useTelegramMiniApp } from "./telegram-webapp-provider";

export interface NotificationItem {
  id: string;
  type:
    | "mention"
    | "comment"
    | "reply"
    | "like"
    | "repost"
    | "follow"
    | "follow_request"
    | "dm"
    | "dm_request"
    | "avatar_unlocked"
    | "announcement"
    | "warning"
    | "appeal"
    | "system";
  actorName: string;
  actorUsername: string;
  postId?: string | null;
  text: string;
  timeLabel: string;
  read: boolean;
}

function formatNotifText(
  type:
    | "mention"
    | "comment"
    | "reply"
    | "like"
    | "repost"
    | "follow"
    | "follow_request"
    | "dm"
    | "dm_request"
    | "avatar_unlocked"
    | "announcement"
    | "warning"
    | "appeal",
  preview?: string | null
): string {
  switch (type) {
    case "mention":
      return preview
        ? `Sizni @belgiladi: “${preview}”`
        : "Sizni post yoki izohda @belgiladi";
    case "reply":
      return preview
        ? `Izohingizga javob yozdi: “${preview}”`
        : "Izohingizga javob qoldirdi";
    case "comment":
      return preview
        ? `Postingizga izoh qoldirdi: “${preview}”`
        : "Postingizga izoh qoldirdi";
    case "like":
      return "Postingizni yoqtirdi ❤️";
    case "repost":
      return preview
        ? `Izohli repost qildi: “${preview}”`
        : "Postingizni repost qildi";
    case "follow":
      return preview || "Sizni kuzatishni boshladi";
    case "follow_request":
      return "Sizga kuzatish so‘rovi yubordi";
    case "dm":
      return preview
        ? `Sizga yangi DM yubordi: “${preview}”`
        : "Sizga yangi xabar yubordi";
    case "dm_request":
      return "Sizga xabar so‘rovi yubordi";
    case "avatar_unlocked":
      return `Yangi avatar ochildi: ${preview ?? "kolleksiya"} ✨`;
    case "announcement":
      return preview ? `📢 ${preview}` : "📢 Platformadan muhim e’lon";
    case "warning":
      return preview ? `⚠️ Ogohlantirish: ${preview}` : "⚠️ Moderatsiya ogohlantirishi";
    case "appeal":
      return preview ? `⚖️ Apellyatsiya: ${preview}` : "⚖️ Apellyatsiya ko‘rib chiqildi";
  }
}

function formatNotifTime(iso: string): string {
  const diffMin = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  );
  if (diffMin < 60) return `${diffMin} daq`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} soat`;
  return `${Math.floor(diffHrs / 24)} kun`;
}

interface AppStateContextValue {
  auth: AuthMeData | null;
  authLoading: boolean;
  refreshAuth: () => Promise<void>;
  loginWithTelegramNow: () => Promise<{ ok: boolean; error?: string }>;
  logoutNow: () => Promise<void>;
  posts: ServerPost[];
  feedLoading: boolean;
  feedUsingServer: boolean;
  loadFeed: (params: {
    tab: "for_you" | "following" | "trending";
    postType?: PostTypeId;
    window?: "24h" | "7d" | "30d";
  }) => Promise<void>;
  addOrUpdatePostInList: (post: ServerPost) => void;
  removePostFromList: (postId: string) => void;
  createLocalFallbackPost: (input: {
    postType: PostTypeId;
    body: string;
    styleConfig: PostStyleTokens;
    hashtags: string[];
  }) => ServerPost;
  toggleReaction: (
    postId: string,
    kind: "like" | "repost" | "bookmark"
  ) => Promise<void>;
  repostPost: (
    postId: string,
    repostType: "simple" | "quote",
    quoteBody?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  notifications: NotificationItem[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markAllNotificationsRead: () => void;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  linkingTelegram: boolean;
  confirmPendingTelegramLink: () => Promise<{ ok: boolean; error?: string }>;
  dismissPendingTelegramLink: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { isTma, initData, pendingLinkToken, clearPendingLinkToken } =
    useTelegramMiniApp();

  const [auth, setAuth] = useState<AuthMeData | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [posts, setPosts] = useState<ServerPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedUsingServer, setFeedUsingServer] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const tmaAutoAuthAttemptedRef = useRef(false);

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      let res = await apiClient.getMe();
      // Retry once on transient cold-start or network hiccup so page refresh never spuriously logs out
      if (!res.ok && res.error.code !== "UNAUTHORIZED") {
        await new Promise((r) => setTimeout(r, 350));
        res = await apiClient.getMe();
      }
      if (res.ok) {
        setAuth(res.data);
      } else if (res.error.code === "UNAUTHORIZED") {
        setAuth(null);
      }
    } catch {
      // Keep previous auth state on transient offline/network error
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    // Inside Telegram Mini App, exchange signed initData for a tma_bearer session once
    if (
      isTma &&
      initData &&
      !pendingLinkToken &&
      !getTmaSessionToken() &&
      !tmaAutoAuthAttemptedRef.current
    ) {
      tmaAutoAuthAttemptedRef.current = true;
      void apiClient
        .loginWithTelegram(initData)
        .then((res) => {
          if (res.ok) {
            setTmaSessionToken(res.data.sessionToken);
          }
        })
        .finally(() => {
          void refreshAuth();
        });
      return;
    }

    void refreshAuth();
  }, [isTma, initData, pendingLinkToken, refreshAuth]);

  const loginWithTelegramNow = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!initData) {
      return {
        ok: false,
        error: "Telegram Mini App orqali ochilganda avtomatik kirish ishlaydi",
      };
    }
    try {
      const res = await apiClient.loginWithTelegram(initData);
      if (res.ok) {
        setTmaSessionToken(res.data.sessionToken);
        await refreshAuth();
        return { ok: true };
      }
      return { ok: false, error: res.error.message };
    } catch {
      return { ok: false, error: "Server bilan bog‘lanishda xatolik" };
    }
  }, [initData, refreshAuth]);

  const logoutNow = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // ignore network error on logout
    } finally {
      setTmaSessionToken(null);
      setAuth(null);
    }
  }, []);

  const confirmPendingTelegramLink = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!initData || !pendingLinkToken) {
      return { ok: false, error: "Bog‘lash ma’lumotlari topilmadi" };
    }
    setLinkingTelegram(true);
    try {
      const res = await apiClient.confirmTelegramLink(
        initData,
        pendingLinkToken
      );
      if (res.ok) {
        if (res.data.sessionToken) {
          setTmaSessionToken(res.data.sessionToken);
        }
        clearPendingLinkToken();
        await refreshAuth();
        return { ok: true };
      }
      return { ok: false, error: res.error.message };
    } finally {
      setLinkingTelegram(false);
    }
  }, [initData, pendingLinkToken, clearPendingLinkToken, refreshAuth]);

  const dismissPendingTelegramLink = useCallback(() => {
    clearPendingLinkToken();
  }, [clearPendingLinkToken]);

  const loadFeed = useCallback(
    async (params: {
      tab: "for_you" | "following" | "trending";
      postType?: PostTypeId;
      window?: "24h" | "7d" | "30d";
    }) => {
      setFeedLoading(true);
      try {
        let res = await apiClient.getFeed({
          tab: params.tab,
          postType: params.postType,
          window: params.window ?? "7d",
          limit: 30,
        });
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 300));
          res = await apiClient.getFeed({
            tab: params.tab,
            postType: params.postType,
            window: params.window ?? "7d",
            limit: 30,
          });
        }
        if (res.ok) {
          setFeedUsingServer(true);
          setPosts(res.data.posts);
        } else {
          setFeedUsingServer(false);
        }
      } catch {
        setFeedUsingServer(false);
      } finally {
        setFeedLoading(false);
      }
    },
    []
  );

  const addOrUpdatePostInList = useCallback((post: ServerPost) => {
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === post.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = post;
        return copy;
      }
      return [post, ...prev];
    });
  }, []);

  const removePostFromList = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const createLocalFallbackPost = useCallback(
    (input: {
      postType: PostTypeId;
      body: string;
      styleConfig: PostStyleTokens;
      hashtags: string[];
    }) => {
      const now = new Date().toISOString();
      const post: ServerPost = {
        id: `local_${Date.now()}`,
        authorId: auth?.user?.id || "guest",
        authorUsername: auth?.profile?.username || "guest_user",
        authorDisplayName: auth?.profile?.displayName || "Mehmon Foydalanuvchi",
        authorVerified: Boolean(auth?.user?.emailVerifiedAt),
        postType: input.postType,
        body: input.body,
        styleConfig: input.styleConfig,
        hashtags: input.hashtags,
        isEdited: false,
        editedAt: null,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 1,
        repostsCount: 0,
        bookmarksCount: 0,
        likedByMe: false,
        repostedByMe: false,
        bookmarkedByMe: false,
        followedByMe: false,
        createdAt: now,
        updatedAt: now,
      };
      setPosts((prev) => [post, ...prev]);
      return post;
    },
    [auth]
  );

  const refreshNotifications = useCallback(async () => {
    if (!auth?.user) return;
    try {
      const res = await apiClient.getNotifications();
      if (res.ok) {
        setNotifications(
          res.data.notifications.map((n) => ({
            id: n.id,
            type: n.type,
            actorName: n.actorDisplayName,
            actorUsername: n.actorUsername,
            postId: n.postId,
            text: formatNotifText(n.type, n.bodyPreview),
            timeLabel: formatNotifTime(n.createdAt),
            read: Boolean(n.readAt),
          }))
        );
      }
    } catch {
      // ignore fallback mode
    }
  }, [auth?.user]);

  useEffect(() => {
    if (auth?.user) {
      void refreshNotifications();
    }
  }, [auth?.user, refreshNotifications]);

  const toggleReaction = useCallback(
    async (postId: string, kind: "like" | "repost" | "bookmark") => {
      let nextActive = true;
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;
          if (kind === "like") {
            nextActive = !post.likedByMe;
            return {
              ...post,
              likedByMe: nextActive,
              likesCount: Math.max(
                0,
                post.likesCount + (nextActive ? 1 : -1)
              ),
            };
          }
          if (kind === "repost") {
            nextActive = !post.repostedByMe;
            return {
              ...post,
              repostedByMe: nextActive,
              repostsCount: Math.max(
                0,
                post.repostsCount + (nextActive ? 1 : -1)
              ),
            };
          }
          nextActive = !post.bookmarkedByMe;
          return {
            ...post,
            bookmarkedByMe: nextActive,
            bookmarksCount: Math.max(
              0,
              post.bookmarksCount + (nextActive ? 1 : -1)
            ),
          };
        })
      );

      if (auth?.user && !postId.startsWith("local_")) {
        if (kind === "like") {
          const res = await apiClient.toggleLike(postId).catch(() => null);
          if (res?.ok) {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      likedByMe: res.data.liked,
                      likesCount: res.data.likesCount,
                    }
                  : p
              )
            );
          }
        } else if (kind === "repost") {
          if (nextActive) {
            await apiClient
              .createRepost(postId, { repostType: "simple" })
              .catch(() => null);
          } else {
            await apiClient
              .setReaction(postId, "repost", false)
              .catch(() => null);
          }
        } else {
          await apiClient
            .setReaction(postId, "bookmark", nextActive)
            .catch(() => null);
        }
      }
    },
    [auth?.user]
  );

  const repostPost = useCallback(
    async (
      postId: string,
      repostType: "simple" | "quote",
      quoteBody?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!auth?.user || postId.startsWith("local_")) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  repostedByMe: true,
                  repostsCount: p.repostsCount + 1,
                }
              : p
          )
        );
        return { ok: true };
      }

      const res = await apiClient.createRepost(postId, {
        repostType,
        quoteBody,
      });
      if (!res.ok) {
        return { ok: false, error: res.error.message };
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                repostedByMe: true,
                repostsCount: p.repostsCount + 1,
              }
            : p
        )
      );
      return { ok: true };
    },
    [auth?.user]
  );

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (auth?.user) {
      void apiClient.markAllNotificationsRead().catch(() => null);
    }
  }, [auth?.user]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      auth,
      authLoading,
      refreshAuth,
      loginWithTelegramNow,
      logoutNow,
      posts,
      feedLoading,
      feedUsingServer,
      loadFeed,
      addOrUpdatePostInList,
      removePostFromList,
      createLocalFallbackPost,
      toggleReaction,
      repostPost,
      notifications,
      unreadCount,
      refreshNotifications,
      markAllNotificationsRead,
      menuOpen,
      setMenuOpen,
      linkingTelegram,
      confirmPendingTelegramLink,
      dismissPendingTelegramLink,
    }),
    [
      auth,
      authLoading,
      refreshAuth,
      loginWithTelegramNow,
      logoutNow,
      posts,
      feedLoading,
      feedUsingServer,
      loadFeed,
      addOrUpdatePostInList,
      removePostFromList,
      createLocalFallbackPost,
      toggleReaction,
      repostPost,
      notifications,
      unreadCount,
      refreshNotifications,
      markAllNotificationsRead,
      menuOpen,
      linkingTelegram,
      confirmPendingTelegramLink,
      dismissPendingTelegramLink,
    ]
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return ctx;
}
