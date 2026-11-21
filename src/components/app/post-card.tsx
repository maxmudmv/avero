"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  CornerDownRight,
  Edit3,
  Eye,
  Flag,
  Heart,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { VerifiedMark } from "@/components/app/verified-mark";
import {
  GlassAvatar,
  GlassButton,
  GlassCard,
  GlassDropdown,
  GlassModal,
  GlassSelect,
  GlassSheet,
  GlassTextarea,
  cn,
  triggerHapticImpact,
  useDesignSystem,
} from "@/design-system";
import {
  apiClient,
  type CommentPolicy,
  type CommentReportReasonCode,
  type ServerComment,
  type ServerPost,
} from "@/lib/api-client";
import { COMMENT_REPORT_REASONS } from "@/lib/validation/social";
import { type PostTypeId } from "@/lib/posts/styles";
import { useAppState } from "./app-state-provider";

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return "Hozir";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} daq`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat`;
  const days = Math.floor(hours / 24);
  return `${days} kun`;
}

function renderTextWithMentions(text: string): React.ReactNode {
  const parts = text.split(
    /(@[a-zA-Z0-9._]{5,20}|#[a-zA-Z0-9_\u0400-\u04FF]{2,32})/g
  );
  return parts.map((part, idx) => {
    if (part.startsWith("@") && part.length >= 6) {
      const handle = part.slice(1).toLowerCase();
      return (
        <Link
          key={`${idx}-${part}`}
          href={`/u/${encodeURIComponent(handle)}`}
          className="font-mono text-sky-400 hover:underline"
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith("#") && part.length >= 3) {
      const tag = part.slice(1).toLowerCase();
      return (
        <Link
          key={`${idx}-${part}`}
          href={`/search?tag=${encodeURIComponent(tag)}`}
          className="font-medium text-sky-400/90 hover:text-sky-300 hover:underline"
        >
          {part}
        </Link>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const COMMENT_POLICY_OPTIONS: Array<{ value: CommentPolicy; label: string }> = [
  { value: "everyone", label: "Hamma izoh yoza oladi" },
  { value: "followers", label: "Faqat obunachilar" },
  { value: "closed", label: "Izohlar yopilgan" },
];

export const PostCard = React.memo(function PostCard({
  post,
}: {
  post: ServerPost;
}) {
  const { toast } = useDesignSystem();
  const {
    auth,
    t,
    toggleReaction,
    repostPost,
    addOrUpdatePostInList,
    removePostFromList,
  } = useAppState();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ServerComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ServerComment | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  const [repostOpen, setRepostOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState("");
  const [reposting, setReposting] = useState(false);

  const [reportTargetComment, setReportTargetComment] =
    useState<ServerComment | null>(null);
  const [reportReason, setReportReason] =
    useState<CommentReportReasonCode>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [editType, setEditType] = useState<PostTypeId>(post.postType);
  const [editCommentPolicy, setEditCommentPolicy] = useState<CommentPolicy>(
    post.commentPolicy ?? "everyone"
  );
  const [savingEdit, setSavingEdit] = useState(false);

  const [localViews, setLocalViews] = useState(post.viewsCount);
  const viewRecordedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalViews(post.viewsCount);
  }, [post.viewsCount]);

  // Unique view tracking (1 per authenticated user) via IntersectionObserver
  useEffect(() => {
    if (
      !auth?.user ||
      viewRecordedRef.current ||
      post.id.startsWith("local_") ||
      post.id.startsWith("00000000-")
    ) {
      return;
    }

    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !viewRecordedRef.current) {
          viewRecordedRef.current = true;
          observer.disconnect();
          void apiClient.recordView(post.id).then((res) => {
            if (res.ok) {
              setLocalViews(res.data.viewsCount);
            }
          });
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [auth?.user, post.id]);

  const isOwner = Boolean(
    auth?.user?.id &&
      (auth.user.id === post.authorId || post.id.startsWith("local_"))
  );

  const openComments = async () => {
    setCommentsOpen(true);
    if (post.id.startsWith("local_") || post.id.startsWith("00000000-")) {
      return;
    }
    setLoadingComments(true);
    try {
      const res = await apiClient.getComments(post.id);
      if (res.ok) {
        setComments(res.data.comments);
      }
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentDraft.trim();
    if (!trimmed) return;

    if (
      !auth?.user ||
      post.id.startsWith("local_") ||
      post.id.startsWith("00000000-")
    ) {
      setComments((prev) => [
        ...prev,
        {
          id: `c_${Date.now()}`,
          postId: post.id,
          authorId: auth?.user?.id || "guest",
          parentCommentId: replyTo?.id ?? null,
          authorUsername: auth?.profile?.username || "guest",
          authorDisplayName: auth?.profile?.displayName || "Siz",
          body: trimmed,
          likesCount: 0,
          repliesCount: 0,
          likedByMe: false,
          createdAt: new Date().toISOString(),
        },
      ]);
      addOrUpdatePostInList({
        ...post,
        commentsCount: post.commentsCount + 1,
      });
      setCommentDraft("");
      setReplyTo(null);
      toast({ title: "Izoh qo‘shildi", variant: "success" });
      return;
    }

    const res = await apiClient.createComment(post.id, trimmed, replyTo?.id);
    if (res.ok) {
      setComments((prev) => [...prev, res.data.comment]);
      addOrUpdatePostInList({
        ...post,
        commentsCount: post.commentsCount + 1,
      });
      setCommentDraft("");
      setReplyTo(null);
      toast({ title: "Izoh qo‘shildi", variant: "success" });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    triggerHapticImpact("light");
    if (!auth?.user || commentId.startsWith("c_")) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                likedByMe: !c.likedByMe,
                likesCount: Math.max(0, c.likesCount + (c.likedByMe ? -1 : 1)),
              }
            : c
        )
      );
      return;
    }

    const res = await apiClient.toggleCommentLike(commentId);
    if (res.ok) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likedByMe: res.data.liked, likesCount: res.data.likesCount }
            : c
        )
      );
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!auth?.user || commentId.startsWith("c_")) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      return;
    }
    const res = await apiClient.deleteComment(commentId);
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      addOrUpdatePostInList({
        ...post,
        commentsCount: Math.max(0, post.commentsCount - 1),
      });
      toast({ title: "Izoh o‘chirildi", variant: "success" });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const handleSimpleRepost = async () => {
    if (post.repostedByMe) {
      await toggleReaction(post.id, "repost");
      setRepostOpen(false);
      toast({ title: "Repost olib tashlandi", variant: "success" });
      return;
    }
    setReposting(true);
    try {
      const res = await repostPost(post.id, "simple");
      if (res.ok) {
        setRepostOpen(false);
        toast({ title: "Oddiy repost qilindi", variant: "success" });
      } else {
        toast({ title: res.error ?? "Repostda xatolik", variant: "error" });
      }
    } finally {
      setReposting(false);
    }
  };

  const handleQuoteRepost = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = quoteDraft.trim();
    if (!q) return;
    setReposting(true);
    try {
      const res = await repostPost(post.id, "quote", q);
      if (res.ok) {
        setQuoteDraft("");
        setRepostOpen(false);
        toast({ title: "Izohli repost yuborildi", variant: "success" });
      } else {
        toast({ title: res.error ?? "Xatolik yuz berdi", variant: "error" });
      }
    } finally {
      setReposting(false);
    }
  };

  const handleSubmitCommentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTargetComment) return;
    setSubmittingReport(true);
    try {
      const res = await apiClient.reportComment({
        commentId: reportTargetComment.id,
        reasonCode: reportReason,
        details: reportDetails.trim() || undefined,
      });
      if (res.ok) {
        toast({ title: "Shikoyat qabul qilindi", variant: "success" });
        setReportTargetComment(null);
        setReportDetails("");
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editBody.trim();
    if (!trimmed) return;

    if (post.id.startsWith("local_") || !auth?.user) {
      addOrUpdatePostInList({
        ...post,
        postType: editType,
        body: trimmed,
        commentPolicy: editCommentPolicy,
        isEdited: true,
        editedAt: new Date().toISOString(),
      });
      setEditOpen(false);
      toast({ title: "Post tahrirlandi", variant: "success" });
      return;
    }

    setSavingEdit(true);
    try {
      const res = await apiClient.updatePost(post.id, {
        postType: editType,
        body: trimmed,
        styleConfig: post.styleConfig,
        commentPolicy: editCommentPolicy,
      });
      if (res.ok) {
        addOrUpdatePostInList(res.data.post);
        setEditOpen(false);
        toast({ title: "Oxirgi versiya saqlandi", variant: "success" });
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (post.id.startsWith("local_") || !auth?.user) {
      removePostFromList(post.id);
      toast({ title: "Post butunlay o‘chirildi", variant: "success" });
      return;
    }
    const res = await apiClient.deletePost(post.id);
    if (res.ok) {
      removePostFromList(post.id);
      toast({ title: "Post butunlay o‘chirildi", variant: "success" });
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const dropdownItems = [
    {
      id: "bookmark",
      label: post.bookmarkedByMe
        ? "Saqlanganlardan olish"
        : "Saqlab qo‘yish",
      onSelect: () => {
        void toggleReaction(post.id, "bookmark");
      },
    },
    ...(isOwner
      ? [
          {
            id: "edit",
            label: "Tahrirlash",
            icon: <Edit3 className="h-3.5 w-3.5" />,
            onSelect: () => {
              setEditBody(post.body);
              setEditType(post.postType);
              setEditCommentPolicy(post.commentPolicy ?? "everyone");
              setEditOpen(true);
            },
          },
          {
            id: "delete",
            label: "Butunlay o‘chirish",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            danger: true,
            onSelect: () => {
              void handleDelete();
            },
          },
        ]
      : []),
  ];

  return (
    <div ref={cardRef}>
      <GlassCard interactive padding="md">
        <div className="min-w-0">
          {/* Compact Header: Smaller Avatar + @username + Time + Actions Menu */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link
                href={`/u/${encodeURIComponent(post.authorUsername)}`}
                aria-label={`@${post.authorUsername} profili`}
                className="glass-focus-ring shrink-0 rounded-full"
              >
                <GlassAvatar
                  name={post.authorDisplayName}
                  seed={post.authorUsername}
                  avatarId={post.authorAvatarId}
                  size="xs"
                  className="h-8 w-8"
                />
              </Link>

              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Link
                  href={`/u/${encodeURIComponent(post.authorUsername)}`}
                  className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] hover:underline"
                >
                  @{post.authorUsername}
                </Link>
                {post.authorVerified ? <VerifiedMark size={13} /> : null}
                <span className="text-[12px] text-[var(--text-muted)]">·</span>
                <span className="text-[12px] text-[var(--text-muted)]">
                  {formatRelativeTime(post.createdAt)}
                </span>
                {post.isEdited ? (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    (tahrirlangan)
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center">
              <GlassDropdown
                ariaLabel="Post amallari"
                trigger={
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-fill-subtle)] hover:text-[var(--text-primary)]">
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                }
                items={dropdownItems}
              />
            </div>
          </div>

          {/* Full-Width Pure-Text Body aligned flush with Avatar left edge */}
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-[1.68] text-[var(--text-primary)]">
            {renderTextWithMentions(post.body)}
          </p>

          {/* Only show extra hashtags below if they are not already written inline inside post.body */}
          {(() => {
            const lowerBody = post.body.toLowerCase();
            const extraTags = post.hashtags
              .slice(0, 3)
              .filter((tag) => !lowerBody.includes(`#${tag.toLowerCase()}`));
            if (extraTags.length === 0) return null;
            return (
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                {extraTags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/search?tag=${encodeURIComponent(tag)}`}
                    className="glass-focus-ring rounded font-mono text-[12.5px] font-medium text-sky-400/90 transition-colors hover:text-sky-300"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            );
          })()}

          {/* Centered 5 Post Metrics: Like, Comments, Repost, Bookmarks, Views */}
          <div className="mt-3.5 flex items-center justify-center gap-5 pt-1 sm:gap-7">
            <button
              type="button"
              aria-label="Yoqtirish"
              aria-pressed={post.likedByMe}
              onClick={() => {
                triggerHapticImpact("light");
                void toggleReaction(post.id, "like");
              }}
              className={cn(
                "glass-focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-1 text-[var(--text-secondary)] transition-all duration-150 active:scale-90 cursor-pointer",
                post.likedByMe
                  ? "text-rose-500"
                  : "hover:text-[var(--text-primary)]"
              )}
            >
              <Heart
                className={cn(
                  "h-[18px] w-[18px] transition-transform duration-150",
                  post.likedByMe && "scale-105 fill-current"
                )}
              />
              <span className="font-mono text-[12px] tabular-nums">
                {post.likesCount}
              </span>
            </button>

            <button
              type="button"
              aria-label="Izohlar"
              onClick={() => void openComments()}
              className="glass-focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-1 text-[var(--text-secondary)] transition-all duration-150 hover:text-[var(--text-primary)] active:scale-90 cursor-pointer"
            >
              <MessageCircle className="h-[18px] w-[18px]" />
              <span className="font-mono text-[12px] tabular-nums">
                {post.commentsCount}
              </span>
            </button>

            <button
              type="button"
              aria-label="Repost"
              aria-pressed={post.repostedByMe}
              onClick={() => {
                triggerHapticImpact("light");
                setRepostOpen(true);
              }}
              className={cn(
                "glass-focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-1 text-[var(--text-secondary)] transition-all duration-150 active:scale-90 cursor-pointer",
                post.repostedByMe
                  ? "text-emerald-400"
                  : "hover:text-[var(--text-primary)]"
              )}
            >
              <Repeat2 className="h-[18px] w-[18px]" />
              <span className="font-mono text-[12px] tabular-nums">
                {post.repostsCount}
              </span>
            </button>

            <button
              type="button"
              aria-label="Saqlashlar"
              aria-pressed={post.bookmarkedByMe}
              onClick={() => {
                triggerHapticImpact("light");
                void toggleReaction(post.id, "bookmark");
                toast({
                  title: post.bookmarkedByMe
                    ? "Saqlanganlardan olib tashlandi"
                    : "Saqlanganlarga qo‘shildi",
                  variant: "success",
                });
              }}
              className={cn(
                "glass-focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-1 text-[var(--text-secondary)] transition-all duration-150 active:scale-90 cursor-pointer",
                post.bookmarkedByMe
                  ? "text-sky-400"
                  : "hover:text-[var(--text-primary)]"
              )}
            >
              <Bookmark
                className={cn(
                  "h-[18px] w-[18px] transition-transform duration-150",
                  post.bookmarkedByMe && "scale-105 fill-current"
                )}
              />
              <span className="font-mono text-[12px] tabular-nums">
                {post.bookmarksCount}
              </span>
            </button>

            <span
              aria-label={`${localViews} marta ko‘rildi`}
              className="inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] tabular-nums text-[var(--text-muted)]"
            >
              <Eye className="h-3.5 w-3.5" />
              {localViews}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Comments Sheet: clean comments list on top + simple 1-line input bar pinned at bottom */}
      <GlassSheet
        open={commentsOpen}
        onClose={() => {
          setCommentsOpen(false);
          setReplyTo(null);
        }}
        title={t.post.commentsTitle(post.commentsCount)}
        footer={
          post.commentPolicy !== "closed" ? (
            <form
              onSubmit={handleAddComment}
              className="flex w-full flex-col gap-2"
            >
              {replyTo ? (
                <div className="flex items-center justify-between px-1 text-[12px] text-[var(--text-secondary)]">
                  <span>{t.post.replyingTo(replyTo.authorUsername)}</span>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
              <div className="flex w-full items-center gap-2">
                <input
                  type="text"
                  placeholder={
                    replyTo
                      ? t.post.replyPlaceholder(replyTo.authorUsername)
                      : t.post.commentPlaceholder
                  }
                  maxLength={500}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  className="h-10 flex-1 rounded-full border border-[var(--border-matte)] bg-[var(--surface-input)] px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-matte-hover)] focus:outline-none"
                />
                <GlassButton
                  type="submit"
                  size="icon"
                  variant="glass"
                  aria-label="Send"
                  disabled={!commentDraft.trim()}
                  className="h-10 w-10 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </GlassButton>
              </div>
            </form>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {post.commentPolicy && post.commentPolicy !== "everyone" ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                {post.commentPolicy === "closed"
                  ? t.post.commentsClosed
                  : t.post.commentsFollowersOnly}
              </span>
            </div>
          ) : null}

          {loadingComments ? (
            <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
              {t.post.commentsLoading}
            </p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-[var(--text-muted)]">
              {t.post.noComments}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-matte)]">
              {comments.map((comment) => {
                const canDeleteComment = Boolean(
                  auth?.user?.id &&
                    (auth.user.id === comment.authorId ||
                      auth.user.id === post.authorId)
                );
                const canReportComment = Boolean(
                  auth?.user?.id &&
                    auth.user.id !== comment.authorId &&
                    !comment.id.startsWith("c_")
                );
                return (
                  <div
                    key={comment.id}
                    className={cn(
                      "py-3 first:pt-1 last:pb-1",
                      comment.parentCommentId &&
                        "ml-5 border-l border-[var(--border-matte)] pl-3"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {comment.parentCommentId ? (
                          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                        ) : null}
                        <Link
                          href={`/u/${encodeURIComponent(comment.authorUsername)}`}
                          className="truncate font-mono font-semibold text-[var(--text-primary)] hover:underline"
                        >
                          @{comment.authorUsername}
                        </Link>
                      </div>
                      <span className="shrink-0 text-[var(--text-muted)]">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--text-secondary)]">
                      {renderTextWithMentions(comment.body)}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          aria-label="Izohni yoqtirish"
                          onClick={() => void handleToggleCommentLike(comment.id)}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11.5px] transition-colors cursor-pointer",
                            comment.likedByMe
                              ? "text-rose-500"
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          <Heart
                            className={cn(
                              "h-3.5 w-3.5",
                              comment.likedByMe && "fill-current"
                            )}
                          />
                          <span className="font-mono tabular-nums">
                            {comment.likesCount ?? 0}
                          </span>
                        </button>

                        {post.commentPolicy !== "closed" ? (
                          <button
                            type="button"
                            onClick={() => setReplyTo(comment)}
                            className="text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            Javob
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {canReportComment ? (
                          <button
                            type="button"
                            aria-label="Izoh ustidan shikoyat"
                            onClick={() => {
                              setReportTargetComment(comment);
                              setReportReason("spam");
                              setReportDetails("");
                            }}
                            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-muted)] hover:text-amber-400 cursor-pointer"
                          >
                            <Flag className="h-3 w-3" />
                            Shikoyat
                          </button>
                        ) : null}

                        {canDeleteComment ? (
                          <button
                            type="button"
                            aria-label="Izohni o‘chirish"
                            onClick={() => void handleDeleteComment(comment.id)}
                            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            O‘chirish
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlassSheet>

      {/* Repost Modal (Simple vs Quote Repost) */}
      <GlassModal
        open={repostOpen}
        onClose={() => setRepostOpen(false)}
        title="Repost qilish"
        description="Oddiy repost yoki o‘z izohingiz bilan repost tanlang."
      >
        <div className="space-y-4">
          <GlassButton
            type="button"
            variant={post.repostedByMe ? "danger" : "glass"}
            loading={reposting}
            onClick={() => void handleSimpleRepost()}
            className="w-full justify-center"
          >
            <Repeat2 className="h-4 w-4" />
            {post.repostedByMe
              ? "Oddiy repostni olib tashlash"
              : "Oddiy repost"}
          </GlassButton>

          <form
            onSubmit={handleQuoteRepost}
            className="space-y-3 border-t border-[var(--border-matte)] pt-4"
          >
            <GlassTextarea
              label="Izohli repost"
              placeholder="Ushbu post haqida fikringizni qo‘shing..."
              maxLength={500}
              rows={3}
              value={quoteDraft}
              onChange={(e) => setQuoteDraft(e.target.value)}
            />
            <div className="flex justify-end">
              <GlassButton
                type="submit"
                variant="accent"
                loading={reposting}
                disabled={!quoteDraft.trim()}
              >
                Izohli repost yuborish
              </GlassButton>
            </div>
          </form>
        </div>
      </GlassModal>

      {/* Comment-Only Report Modal */}
      <GlassModal
        open={Boolean(reportTargetComment)}
        onClose={() => setReportTargetComment(null)}
        title="Izoh ustidan shikoyat"
        description={
          reportTargetComment
            ? `@${reportTargetComment.authorUsername} izohi bo‘yicha sababni tanlang.`
            : undefined
        }
        footer={
          <>
            <GlassButton
              variant="ghost"
              onClick={() => setReportTargetComment(null)}
            >
              Bekor qilish
            </GlassButton>
            <GlassButton
              variant="danger"
              loading={submittingReport}
              onClick={(e) => void handleSubmitCommentReport(e)}
            >
              Shikoyat yuborish
            </GlassButton>
          </>
        }
      >
        <form onSubmit={handleSubmitCommentReport} className="space-y-4">
          <GlassSelect
            label="Shikoyat sababi"
            value={reportReason}
            onValueChange={(v) =>
              setReportReason(v as CommentReportReasonCode)
            }
            options={COMMENT_REPORT_REASONS.map((r) => ({
              value: r.code,
              label: r.label,
            }))}
          />
          <GlassTextarea
            label="Qo‘shimcha izoh (ixtiyoriy)"
            placeholder="Batafsil ma’lumot..."
            maxLength={300}
            rows={3}
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
          />
        </form>
      </GlassModal>

      {/* Edit Post Modal (keeps ONLY latest version) */}
      <GlassModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Postni tahrirlash"
        description="Faqat oxirgi versiya saqlanadi."
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setEditOpen(false)}>
              Bekor qilish
            </GlassButton>
            <GlassButton
              variant="glass"
              loading={savingEdit}
              onClick={(e) => void handleSaveEdit(e)}
            >
              Saqlash
            </GlassButton>
          </>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <GlassSelect
            label="Izohlar tartibi"
            value={editCommentPolicy}
            onValueChange={(v) => setEditCommentPolicy(v as CommentPolicy)}
            options={COMMENT_POLICY_OPTIONS}
          />
          <GlassTextarea
            label="Post matni"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={5}
          />
        </form>
      </GlassModal>
    </div>
  );
});
