import type { PostStyleTokens, PostTypeId } from "@/lib/posts/styles";
import type { NotificationPreferences } from "@/lib/validation/notifications";

export type UserRoleType = "user" | "moderator" | "admin" | "super_admin";
export type CommentPolicy = "everyone" | "followers" | "closed";
export type BlockLevel = "dm_only" | "follow_only" | "content_only" | "full";
export type CommentReportReasonCode =
  | "spam"
  | "insult"
  | "hate"
  | "illegal"
  | "doxxing"
  | "other";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { requestId?: string };
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  meta?: { requestId?: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse;

export interface AuthMeData {
  user: {
    id: string;
    role: UserRoleType;
    status: "active" | "muted" | "suspended" | "banned";
    suspendedUntil?: string | null;
    primaryEmail: string | null;
    emailVerifiedAt: string | null;
    hasPassword?: boolean;
    onboardingCompleted?: boolean;
    createdAt: string;
  } | null;
  effectivePermissions?: string[];
  profile: {
    username: string;
    displayName: string;
    bio: string;
    avatarId?: string;
    externalLinks?: Array<{ label: string; url: string }>;
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
  } | null;
  settings: {
    language: string;
    theme: "system" | "light" | "dark";
    privacyLevel: "public" | "private" | "followers_only";
    autoApproveFollows?: boolean;
    showOnlineStatus?: boolean;
    allowMentions: boolean;
    emailNotifications: boolean;
    telegramNotifications: boolean;
    telegramBotStarted?: boolean;
    notificationPreferences?: NotificationPreferences;
  } | null;
  identities: Array<{
    provider: "google" | "telegram";
    providerUsername: string | null;
    emailVerified: boolean;
    linkedAt: string;
  }>;
}

export interface ServerPost {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarId?: string;
  authorVerified: boolean;
  postType: PostTypeId;
  body: string;
  styleConfig: PostStyleTokens;
  commentPolicy?: CommentPolicy;
  hashtags: string[];
  isEdited: boolean;
  editedAt: string | null;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  repostsCount: number;
  bookmarksCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  bookmarkedByMe: boolean;
  followedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServerDraft {
  id: string;
  authorId: string;
  postType: PostTypeId;
  body: string;
  styleConfig: PostStyleTokens;
  commentPolicy?: CommentPolicy;
  hashtags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServerComment {
  id: string;
  postId: string;
  authorId: string;
  parentCommentId: string | null;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarId?: string;
  body: string;
  likesCount: number;
  repliesCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface ServerNotification {
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
    | "appeal";
  postId: string | null;
  commentId: string | null;
  bodyPreview: string | null;
  readAt: string | null;
  createdAt: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorAvatarId: string;
}

export interface ModReportItem {
  id: string;
  commentId: string;
  postId: string | null;
  commentBody: string;
  commentAuthorId: string | null;
  commentAuthorUsername: string | null;
  reporterUsername: string;
  reasonCode: string;
  details: string | null;
  status: string;
  resolutionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ModFlagItem {
  id: string;
  contentType: string;
  contentId: string;
  authorId: string;
  authorUsername: string;
  severity: "low" | "medium" | "high";
  reasons: string[];
  excerpt: string;
  status: string;
  decisionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ModAppealItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  actionType: string;
  reason: string;
  status: string;
  reviewReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface GovernanceUserItem {
  userId: string;
  username: string;
  displayName: string;
  role: UserRoleType;
  status: "active" | "muted" | "suspended" | "banned";
  suspendedUntil: string | null;
  createdAt: string;
  delegatedPermissions: string[];
}

export interface AuditLogItem {
  id: number;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  targetUsername: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ServerBlockItem {
  blockedId: string;
  level: BlockLevel;
  createdAt: string;
  username: string;
  displayName: string;
  avatarId: string;
}

export interface ServerDmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ServerDmThread {
  id: string;
  status: "pending" | "accepted" | "declined";
  initiatedBy: string;
  isIncomingRequest: boolean;
  lastMessageAt: string;
  partner: {
    userId: string;
    username: string;
    displayName: string;
    avatarId: string;
  };
  messages: ServerDmMessage[];
}

export interface ServerSearchResults {
  users: Array<{
    userId: string;
    username: string;
    displayName: string;
    bio: string;
    avatarId: string;
    followersCount: number;
    postsCount: number;
    verified: boolean;
  }>;
  hashtags: Array<{
    id: string;
    tag: string;
    postsCount: number;
  }>;
  posts: ServerPost[];
}

export interface PublicProfileResponse {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  avatarId: string;
  externalLinks: Array<{ label: string; url: string }>;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  badges: Array<{
    id: string;
    label: string;
    tone: "accent" | "success" | "glass" | "matte";
  }>;
  privacyLevel: "public" | "private" | "followers_only";
  autoApproveFollows: boolean;
  online: boolean;
  followStatus: "self" | "none" | "following" | "requested";
  myBlockLevel?: BlockLevel | "none";
  contentBlocked?: boolean;
  createdAt: string;
  posts: ServerPost[];
}

export interface OwnerActivityResponse {
  lastVisitAt: string;
  lastPostAt: string | null;
  lastQualifiedAt: string | null;
  activeThreeDayCycles: number;
  activeDaysCount?: number;
  totalVisitsCount: number;
  accountAgeDays: number;
  nextPostDeadlineAt: string;
  withinThreeDayCadence: boolean;
  unlockedAvatars: string[];
}

export interface FollowRequestItem {
  id: string;
  requesterId: string;
  requesterUsername: string;
  requesterDisplayName: string;
  requesterAvatarId: string;
  createdAt: string;
}

export interface PostLimitInfo {
  currentMaxLength: number;
  baseLimit: number;
  verifiedReferralsCount: number;
  emailVerifiedBonus: number;
  referralBonus: number;
  nextMilestoneHint: string;
}

const TMA_SESSION_STORAGE_KEY = "avero_tma_session_v1";
let memoryTmaSessionToken: string | null = null;

export function getTmaSessionToken(): string | null {
  if (memoryTmaSessionToken) return memoryTmaSessionToken;
  if (typeof window !== "undefined") {
    try {
      const stored = window.sessionStorage.getItem(TMA_SESSION_STORAGE_KEY);
      if (stored) {
        memoryTmaSessionToken = stored;
        return stored;
      }
    } catch {
      // Ignore storage access errors in restricted webviews
    }
  }
  return null;
}

export function setTmaSessionToken(token: string | null): void {
  memoryTmaSessionToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        window.sessionStorage.setItem(TMA_SESSION_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(TMA_SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tmaToken = getTmaSessionToken();
  if (tmaToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${tmaToken}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: `HTTP ${res.status}`,
      },
    };
  }
  return json;
}

export const apiClient = {
  getHealth: () =>
    apiFetch<{ status: string; database: { connected: boolean; latencyMs: number } }>(
      "/api/v1/health"
    ),

  getMe: () => apiFetch<AuthMeData>("/api/v1/auth/me"),

  loginWithPassword: (username: string, password: string) =>
    apiFetch<{
      sessionToken: string;
      expiresAt: string;
      userId: string;
      role: UserRoleType;
      needsOnboarding: boolean;
    }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  completeAccountSetup: (payload: {
    username: string;
    displayName: string;
    password: string;
    bio?: string;
  }) =>
    apiFetch<{
      username: string;
      displayName: string;
      bio: string;
      onboardingCompleted: boolean;
      hasPassword: boolean;
    }>("/api/v1/auth/complete-setup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  loginWithTelegram: (initData: string) =>
    apiFetch<{
      sessionToken: string;
      expiresAt: string;
      userId: string;
      role: UserRoleType;
      isNewUser: boolean;
    }>("/api/v1/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),

  confirmTelegramLink: (initData: string, linkToken: string) =>
    apiFetch<{
      linked: boolean;
      provider: "telegram";
      userId: string;
      sessionToken?: string;
      expiresAt?: string;
    }>("/api/v1/auth/link/telegram/confirm", {
      method: "POST",
      body: JSON.stringify({ initData, linkToken }),
    }),

  logout: () =>
    apiFetch<{ loggedOut: boolean }>("/api/v1/auth/logout", {
      method: "POST",
    }),

  logoutAll: () =>
    apiFetch<{ loggedOutAll: boolean }>("/api/v1/auth/logout-all", {
      method: "POST",
    }),

  updateProfile: (payload: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarId?: string;
    externalLinks?: Array<{ label: string; url: string }>;
  }) =>
    apiFetch<{
      profile: {
        userId: string;
        username: string;
        displayName: string;
        bio: string;
        avatarId: string;
        externalLinks: Array<{ label: string; url: string }>;
      };
    }>("/api/v1/account/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateSettings: (payload: {
    language?: string;
    theme?: "system" | "light" | "dark";
    privacyLevel?: "public" | "private" | "followers_only";
    autoApproveFollows?: boolean;
    showOnlineStatus?: boolean;
    allowMentions?: boolean;
    emailNotifications?: boolean;
    telegramNotifications?: boolean;
    notificationPreferences?: Partial<NotificationPreferences>;
  }) =>
    apiFetch<{ settings: AuthMeData["settings"] }>("/api/v1/account/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  confirmTelegramBotStart: (enableNotifications = true) =>
    apiFetch<{ settings: AuthMeData["settings"] }>(
      "/api/v1/account/telegram-bot/confirm-start",
      {
        method: "POST",
        body: JSON.stringify({
          botStartedConsent: true,
          enableNotifications,
        }),
      }
    ),

  getUsernameSuggestions: (q: string) =>
    apiFetch<{ suggestions: string[] }>(
      `/api/v1/account/username-suggestions?q=${encodeURIComponent(q)}`
    ),

  getOwnProfileDashboard: () =>
    apiFetch<{
      profile: PublicProfileResponse;
      activity: OwnerActivityResponse;
      followRequests: FollowRequestItem[];
    }>("/api/v1/account/profile-dashboard"),

  getPublicProfile: (username: string) =>
    apiFetch<{ profile: PublicProfileResponse }>(
      `/api/v1/users/${encodeURIComponent(username)}`
    ),

  getFollowRequests: () =>
    apiFetch<{ requests: FollowRequestItem[] }>("/api/v1/account/follow-requests"),

  respondFollowRequest: (requestId: string, action: "accept" | "decline") =>
    apiFetch<{ status: "accepted" | "declined" }>(
      `/api/v1/account/follow-requests/${requestId}/${action}`,
      { method: "POST" }
    ),

  initTelegramLink: () =>
    apiFetch<{ linkToken: string; deepLink: string | null; expiresAt: string }>(
      "/api/v1/auth/link/telegram/init",
      {
        method: "POST",
        body: JSON.stringify({ consentAccepted: true }),
      }
    ),

  initGoogleLink: () =>
    apiFetch<{ authorizationStartUrl: string; expiresAt: string }>(
      "/api/v1/auth/link/google/init",
      {
        method: "POST",
        body: JSON.stringify({ consentAccepted: true }),
      }
    ),

  unlinkIdentity: (provider: "google" | "telegram") =>
    apiFetch<{ unlinked: boolean; provider: string }>(
      `/api/v1/auth/identities/${provider}`,
      { method: "DELETE" }
    ),

  // --- Feeds & Search ---
  getFeed: (params: {
    tab: "for_you" | "following" | "trending";
    postType?: PostTypeId;
    tag?: string;
    window?: "24h" | "7d" | "30d";
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set("tab", params.tab);
    if (params.postType) qs.set("postType", params.postType);
    if (params.tag) qs.set("tag", params.tag);
    if (params.window) qs.set("window", params.window);
    if (params.limit) qs.set("limit", String(params.limit));
    return apiFetch<{ posts: ServerPost[]; tab: string }>(
      `/api/v1/feed?${qs.toString()}`
    );
  },

  search: (params: {
    q?: string;
    type?: "all" | "posts" | "users" | "hashtags";
    tag?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.type) qs.set("type", params.type);
    if (params.tag) qs.set("tag", params.tag);
    if (params.limit) qs.set("limit", String(params.limit));
    return apiFetch<ServerSearchResults>(`/api/v1/search?${qs.toString()}`);
  },

  getBookmarks: () =>
    apiFetch<{ posts: ServerPost[] }>("/api/v1/bookmarks"),

  // --- Drafts ---
  getDrafts: () => apiFetch<{ drafts: ServerDraft[] }>("/api/v1/drafts"),

  createDraft: (payload: {
    postType: PostTypeId;
    body: string;
    styleConfig?: PostStyleTokens;
    hashtags?: string[];
  }) =>
    apiFetch<{ draft: ServerDraft }>("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDraft: (
    draftId: string,
    payload: {
      postType: PostTypeId;
      body: string;
      styleConfig?: PostStyleTokens;
      hashtags?: string[];
    }
  ) =>
    apiFetch<{ draft: ServerDraft }>(`/api/v1/drafts/${draftId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteDraft: (draftId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/drafts/${draftId}`, {
      method: "DELETE",
    }),

  // --- Posts CRUD & Interactions ---
  createPost: (payload: {
    postType: PostTypeId;
    body: string;
    styleConfig?: PostStyleTokens;
    hashtags?: string[];
    commentPolicy?: CommentPolicy;
    draftId?: string;
  }) =>
    apiFetch<{ post: ServerPost }>("/api/v1/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updatePost: (
    postId: string,
    payload: {
      postType?: PostTypeId;
      body: string;
      styleConfig?: PostStyleTokens;
      hashtags?: string[];
      commentPolicy?: CommentPolicy;
    }
  ) =>
    apiFetch<{ post: ServerPost }>(`/api/v1/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deletePost: (postId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/posts/${postId}`, {
      method: "DELETE",
    }),

  recordView: (postId: string) =>
    apiFetch<{ counted: boolean; viewsCount: number }>(
      `/api/v1/posts/${postId}/view`,
      { method: "POST" }
    ),

  setReaction: (
    postId: string,
    kind: "like" | "repost" | "bookmark",
    active: boolean
  ) =>
    apiFetch<{ active: boolean }>(`/api/v1/posts/${postId}/${kind}`, {
      method: active ? "POST" : "DELETE",
    }),

  toggleLike: (postId: string) =>
    apiFetch<{ liked: boolean; likesCount: number }>(
      `/api/v1/posts/${postId}/like/toggle`,
      { method: "POST" }
    ),

  createRepost: (
    postId: string,
    payload: { repostType: "simple" | "quote"; quoteBody?: string }
  ) =>
    apiFetch<{
      repost: {
        id: string;
        repostType: "simple" | "quote";
        quoteBody: string | null;
      };
    }>(`/api/v1/posts/${postId}/repost`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getComments: (postId: string) =>
    apiFetch<{ comments: ServerComment[] }>(`/api/v1/posts/${postId}/comments`),

  createComment: (postId: string, body: string, parentCommentId?: string) =>
    apiFetch<{ comment: ServerComment }>(`/api/v1/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body,
        ...(parentCommentId ? { parentCommentId } : {}),
      }),
    }),

  deleteComment: (commentId: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/comments/${commentId}`, {
      method: "DELETE",
    }),

  toggleCommentLike: (commentId: string) =>
    apiFetch<{ liked: boolean; likesCount: number }>(
      `/api/v1/comments/${commentId}/like/toggle`,
      { method: "POST" }
    ),

  // --- Notifications, Blocks, Direct Messages & Comment Reports ---
  getNotifications: () =>
    apiFetch<{ notifications: ServerNotification[] }>("/api/v1/notifications"),

  markAllNotificationsRead: () =>
    apiFetch<{ marked: boolean }>("/api/v1/notifications/read-all", {
      method: "POST",
    }),

  getBlocks: () =>
    apiFetch<{ blocks: ServerBlockItem[] }>("/api/v1/account/blocks"),

  blockUser: (userId: string, level: BlockLevel) =>
    apiFetch<{ blockedId: string; level: BlockLevel }>(
      `/api/v1/users/${userId}/block`,
      {
        method: "PUT",
        body: JSON.stringify({ level }),
      }
    ),

  unblockUser: (userId: string) =>
    apiFetch<{ blockedId: string; level: "none" }>(
      `/api/v1/users/${userId}/block`,
      { method: "DELETE" }
    ),

  getDmThreads: () =>
    apiFetch<{ threads: ServerDmThread[] }>("/api/v1/messages/threads"),

  sendDm: (recipientId: string, body: string) =>
    apiFetch<{
      threadId: string;
      threadStatus: "pending" | "accepted" | "declined";
      message: ServerDmMessage;
    }>("/api/v1/messages/send", {
      method: "POST",
      body: JSON.stringify({ recipientId, body }),
    }),

  respondDmRequest: (threadId: string, action: "accept" | "decline") =>
    apiFetch<{ status: "accepted" | "declined" }>(
      `/api/v1/messages/threads/${threadId}/${action}`,
      { method: "POST" }
    ),

  reportComment: (payload: {
    commentId: string;
    reasonCode: CommentReportReasonCode;
    details?: string;
  }) =>
    apiFetch<{
      report: {
        id: string;
        commentId: string;
        reasonCode: string;
        status: string;
        createdAt: string;
      };
    }>("/api/v1/reports/comments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  followUser: (userId: string, follow: boolean) =>
    apiFetch<{ following: boolean; status: "following" | "requested" | "none" }>(
      `/api/v1/users/${userId}/follow`,
      {
        method: follow ? "POST" : "DELETE",
      }
    ),

  getPostLimit: () =>
    apiFetch<{ limit: PostLimitInfo }>("/api/v1/account/post-limit"),

  claimReferral: (inviterUsername: string) =>
    apiFetch<{ inviterUserId: string; inviterNewMaxLength: number }>(
      "/api/v1/account/referrals",
      {
        method: "POST",
        body: JSON.stringify({ inviterUsername }),
      }
    ),

  // --- Moderation Appeals & Admin Governance ---
  getMyAppeals: () =>
    apiFetch<{
      warnings: Array<{ id: string; reason: string; createdAt: string }>;
      appeals: Array<{
        id: string;
        actionType: string;
        reason: string;
        status: string;
        reviewReason: string | null;
        createdAt: string;
        reviewedAt: string | null;
      }>;
    }>("/api/v1/moderation/appeals/my"),

  submitAppeal: (payload: {
    actionType: "warning" | "mute" | "suspend" | "ban" | "comment_deleted";
    reason: string;
  }) =>
    apiFetch<{ appeal: { id: string; status: string } }>(
      "/api/v1/moderation/appeals",
      { method: "POST", body: JSON.stringify(payload) }
    ),

  getModReports: () =>
    apiFetch<{ reports: ModReportItem[] }>("/api/v1/admin/reports"),

  reviewModReport: (
    reportId: string,
    payload: {
      status: "under_review" | "resolved_action" | "resolved_dismissed";
      reason: string;
      deleteComment?: boolean;
      warnAuthor?: boolean;
    }
  ) =>
    apiFetch<{ report: { id: string; status: string } }>(
      `/api/v1/admin/reports/${reportId}/review`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  deleteCommentByMod: (commentId: string, reason: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/admin/comments/${commentId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),

  getModFlags: () => apiFetch<{ flags: ModFlagItem[] }>("/api/v1/admin/flags"),

  reviewModFlag: (
    flagId: string,
    payload: {
      status: "reviewed_safe" | "reviewed_action";
      reason: string;
      warnAuthor?: boolean;
    }
  ) =>
    apiFetch<{ flag: { id: string; status: string } }>(
      `/api/v1/admin/flags/${flagId}/review`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  warnUser: (userId: string, reason: string, reportId?: string) =>
    apiFetch<{ warning: { id: string } }>(`/api/v1/admin/users/${userId}/warn`, {
      method: "POST",
      body: JSON.stringify({ reason, reportId }),
    }),

  moderateUserStatus: (
    userId: string,
    payload: {
      action: "mute" | "suspend" | "ban" | "restore";
      reason: string;
      durationHours?: number;
      humanConfirmed: true;
    }
  ) =>
    apiFetch<{ user: { id: string; status: string } }>(
      `/api/v1/admin/users/${userId}/status`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  getGovernanceUsers: (q?: string) =>
    apiFetch<{ users: GovernanceUserItem[] }>(
      `/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),

  assignUserRole: (
    userId: string,
    role: "user" | "moderator" | "admin",
    reason?: string
  ) =>
    apiFetch<{ user: { id: string; role: UserRoleType } }>(
      `/api/v1/admin/users/${userId}/role`,
      { method: "PATCH", body: JSON.stringify({ role, reason }) }
    ),

  setAdminPermissions: (
    userId: string,
    permissions: string[],
    reason: string
  ) =>
    apiFetch<{ userId: string; permissions: string[] }>(
      `/api/v1/admin/admins/${userId}/permissions`,
      { method: "PUT", body: JSON.stringify({ permissions, reason }) }
    ),

  getModAppeals: () =>
    apiFetch<{ appeals: ModAppealItem[] }>("/api/v1/admin/appeals"),

  reviewModAppeal: (
    appealId: string,
    payload: {
      decision: "approved" | "rejected";
      reason: string;
      humanConfirmed: true;
    }
  ) =>
    apiFetch<{ appeal: { id: string; status: string } }>(
      `/api/v1/admin/appeals/${appealId}/review`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  sendAnnouncement: (title: string, body: string) =>
    apiFetch<{
      announcement: {
        id: string;
        title: string;
        body: string;
        deliveredCount: number;
      };
    }>("/api/v1/admin/announcements", {
      method: "POST",
      body: JSON.stringify({ title, body }),
    }),

  getAuditLogs: () =>
    apiFetch<{ logs: AuditLogItem[] }>("/api/v1/admin/audit-logs"),
};
