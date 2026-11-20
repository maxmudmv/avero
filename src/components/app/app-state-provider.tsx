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

const FALLBACK_DEMO_POSTS: ServerPost[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    authorId: "00000000-0000-4000-8000-000000000101",
    authorUsername: "azizbek",
    authorDisplayName: "Azizbek Karimov",
    authorVerified: true,
    postType: "thought",
    body: "Matnga asoslangan ijtimoiy tarmoqning eng katta kuchi — shovqinsiz, toza fikr almashish. Rasm va video yo‘qligi har bir so‘zning qadrini oshiradi.",
    styleConfig: { editorMode: "simple" },
    hashtags: ["avero", "fikrlar"],
    isEdited: false,
    editedAt: null,
    likesCount: 48,
    commentsCount: 2,
    viewsCount: 312,
    repostsCount: 9,
    bookmarksCount: 14,
    likedByMe: false,
    repostedByMe: false,
    bookmarkedByMe: false,
    followedByMe: false,
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    authorId: "00000000-0000-4000-8000-000000000102",
    authorUsername: "madina_r",
    authorDisplayName: "Madina Rustamova",
    authorVerified: false,
    postType: "poem",
    body: "Sukut ichra tug‘ilar satrlar,\nOq qog‘oz emas — shaffof oyna bu.\nHar bir so‘zda yashar bir ma’no,\nKo‘ngil tubidan chiqqan sado bu.",
    styleConfig: {
      editorMode: "advanced",
      templateId: "poetic_center",
      fontFamily: "serif",
      textColor: "pearl",
      bgStyle: "aurora",
      isBold: false,
      isItalic: true,
      textAlign: "center",
    },
    hashtags: ["sheriyat", "ijod"],
    isEdited: false,
    editedAt: null,
    likesCount: 73,
    commentsCount: 5,
    viewsCount: 540,
    repostsCount: 18,
    bookmarksCount: 29,
    likedByMe: false,
    repostedByMe: false,
    bookmarkedByMe: true,
    followedByMe: false,
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    authorId: "00000000-0000-4000-8000-000000000103",
    authorUsername: "sardor_dev",
    authorDisplayName: "Sardor Alimov",
    authorVerified: true,
    postType: "quote",
    body: "“Murakkablikni olib tashlaganingizda, haqiqiy mohiyat qoladi.” — Minimalist muhandislik tamoyili.",
    styleConfig: {
      editorMode: "advanced",
      templateId: "quote_editorial",
      fontFamily: "display",
      textColor: "sky",
      bgStyle: "midnight",
      isBold: true,
      isItalic: false,
      textAlign: "center",
    },
    hashtags: ["iqtibos", "texnologiya"],
    isEdited: false,
    editedAt: null,
    likesCount: 91,
    commentsCount: 7,
    viewsCount: 820,
    repostsCount: 24,
    bookmarksCount: 41,
    likedByMe: true,
    repostedByMe: false,
    bookmarkedByMe: false,
    followedByMe: true,
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
];

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n_1",
    type: "reply",
    actorName: "Dilnoza",
    actorUsername: "dilnoza_uz",
    text: "Sizning fikringizga izoh qoldirdi",
    timeLabel: "8 daq",
    read: false,
  },
  {
    id: "n_2",
    type: "like",
    actorName: "Sardor Alimov",
    actorUsername: "sardor_dev",
    text: "Sizning postingizni yoqtirdi",
    timeLabel: "24 daq",
    read: false,
  },
  {
    id: "n_3",
    type: "system",
    actorName: "Avero Xavfsizlik",
    actorUsername: "system",
    text: "Akkauntingizda RLS va sessiya himoyasi faol.",
    timeLabel: "2 soat",
    read: true,
  },
];

interface AppStateContextValue {
  auth: AuthMeData | null;
  authLoading: boolean;
  refreshAuth: () => Promise<void>;
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
  const [posts, setPosts] = useState<ServerPost[]>(FALLBACK_DEMO_POSTS);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedUsingServer, setFeedUsingServer] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    INITIAL_NOTIFICATIONS
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const tmaAutoAuthAttemptedRef = useRef(false);

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await apiClient.getMe();
      if (res.ok) {
        setAuth(res.data);
      } else {
        setAuth(null);
      }
    } catch {
      setAuth(null);
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
        const res = await apiClient.getFeed({
          tab: params.tab,
          postType: params.postType,
          window: params.window ?? "7d",
          limit: 30,
        });
        if (res.ok) {
          setFeedUsingServer(true);
          if (res.data.posts.length > 0 || params.tab === "following") {
            setPosts(res.data.posts);
          } else {
            // If DB is empty on first boot, keep curated preview posts for discovery
            const filteredFallback = params.postType
              ? FALLBACK_DEMO_POSTS.filter((p) => p.postType === params.postType)
              : FALLBACK_DEMO_POSTS;
            setPosts(filteredFallback);
          }
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
