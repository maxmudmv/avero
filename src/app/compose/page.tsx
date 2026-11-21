"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Hash, Plus, Send, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import { useTelegramMainButton } from "@/components/app/telegram-webapp-provider";
import {
  GlassAvatar,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  GlassTextarea,
  useDesignSystem,
} from "@/design-system";
import {
  apiClient,
  type CommentPolicy,
  type PostLimitInfo,
  type ServerDraft,
} from "@/lib/api-client";
import {
  type PostStyleTokens,
  type PostTypeId,
} from "@/lib/posts/styles";
import {
  MAX_HASHTAGS_PER_POST,
  normalizeHashtag,
} from "@/lib/validation/posts";

const GUEST_DRAFT_STORAGE_KEY = "avero_guest_draft_v1";
const SIMPLE_STYLE_CONFIG: PostStyleTokens = { editorMode: "simple" };

export default function ComposePage() {
  const router = useRouter();
  const { toast } = useDesignSystem();
  const { auth, addOrUpdatePostInList, createLocalFallbackPost } =
    useAppState();

  const [postType, setPostType] = useState<PostTypeId>("note");
  const [commentPolicy, setCommentPolicy] = useState<CommentPolicy>("everyone");
  const [body, setBody] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [maxPostLength, setMaxPostLength] = useState(1000);
  const [limitInfo, setLimitInfo] = useState<PostLimitInfo | null>(null);

  const [activeDraftId, setActiveDraftId] = useState<string | undefined>();
  const [savedDrafts, setSavedDrafts] = useState<ServerDraft[]>([]);
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [publishing, setPublishing] = useState(false);

  const autoSaveTimerRef = useRef<number | null>(null);

  // Load unlocked post limit and user's private drafts
  useEffect(() => {
    if (!auth?.user) {
      try {
        const raw = window.localStorage.getItem(GUEST_DRAFT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            postType?: PostTypeId;
            body?: string;
            hashtags?: string[];
          };
          if (parsed.body) setBody(parsed.body);
          if (parsed.postType) setPostType(parsed.postType);
          if (Array.isArray(parsed.hashtags)) {
            setHashtags(parsed.hashtags.slice(0, MAX_HASHTAGS_PER_POST));
          }
        }
      } catch {
        // Ignore storage errors
      }
      return;
    }

    void apiClient.getPostLimit().then((res) => {
      if (res.ok) {
        setMaxPostLength(res.data.limit.currentMaxLength);
        setLimitInfo(res.data.limit);
      }
    });

    void apiClient.getDrafts().then((res) => {
      if (res.ok) {
        setSavedDrafts(res.data.drafts);
      }
    });
  }, [auth?.user]);

  // Auto-save Draft (debounced)
  const triggerAutoSave = useCallback(
    (nextState: {
      postType: PostTypeId;
      body: string;
      styleConfig: PostStyleTokens;
      hashtags: string[];
    }) => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }

      if (!nextState.body.trim()) {
        setDraftStatus("idle");
        return;
      }

      setDraftStatus("saving");
      autoSaveTimerRef.current = window.setTimeout(async () => {
        if (!auth?.user) {
          try {
            window.localStorage.setItem(
              GUEST_DRAFT_STORAGE_KEY,
              JSON.stringify(nextState)
            );
            setDraftStatus("saved");
          } catch {
            setDraftStatus("idle");
          }
          return;
        }

        const res = activeDraftId
          ? await apiClient.updateDraft(activeDraftId, nextState)
          : await apiClient.createDraft(nextState);

        if (res.ok) {
          setActiveDraftId(res.data.draft.id);
          setSavedDrafts((prev) => {
            const filtered = prev.filter((d) => d.id !== res.data.draft.id);
            return [res.data.draft, ...filtered];
          });
          setDraftStatus("saved");
        } else {
          setDraftStatus("idle");
        }
      }, 900);
    },
    [auth?.user, activeDraftId]
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleAddHashtag = () => {
    if (hashtags.length >= MAX_HASHTAGS_PER_POST) {
      toast({
        title: `Maksimum ${MAX_HASHTAGS_PER_POST} ta hashtag mumkin`,
        variant: "warning",
      });
      return;
    }
    const clean = normalizeHashtag(tagInput);
    if (!clean) {
      toast({
        title: "Hashtag kamida 2 ta harf/raqamdan iborat bo‘lishi kerak",
        variant: "warning",
      });
      return;
    }
    if (hashtags.includes(clean)) {
      setTagInput("");
      return;
    }
    const nextTags = [...hashtags, clean];
    setHashtags(nextTags);
    setTagInput("");
    triggerAutoSave({
      postType,
      body,
      styleConfig: SIMPLE_STYLE_CONFIG,
      hashtags: nextTags,
    });
  };

  const handleRemoveHashtag = (tag: string) => {
    const nextTags = hashtags.filter((t) => t !== tag);
    setHashtags(nextTags);
    triggerAutoSave({
      postType,
      body,
      styleConfig: SIMPLE_STYLE_CONFIG,
      hashtags: nextTags,
    });
  };

  const handleResumeDraft = (draft: ServerDraft) => {
    setActiveDraftId(draft.id);
    setPostType(draft.postType);
    setBody(draft.body);
    setHashtags((draft.hashtags ?? []).slice(0, MAX_HASHTAGS_PER_POST));
    toast({ title: "Qoralama yuklandi", variant: "success" });
  };

  const handleDeleteDraft = async (draftId: string) => {
    const res = await apiClient.deleteDraft(draftId);
    if (res.ok) {
      setSavedDrafts((prev) => prev.filter((d) => d.id !== draftId));
      if (activeDraftId === draftId) {
        setActiveDraftId(undefined);
      }
      toast({ title: "Qoralama o‘chirildi", variant: "success" });
    }
  };

  const trimmed = body.trim();
  const canPublish = trimmed.length >= 1 && trimmed.length <= maxPostLength;

  const publishPost = useCallback(async () => {
    if (!canPublish) return;

    if (!auth?.user) {
      createLocalFallbackPost({
        postType,
        body: trimmed,
        styleConfig: SIMPLE_STYLE_CONFIG,
        hashtags,
      });
      try {
        window.localStorage.removeItem(GUEST_DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      toast({
        title: "Post chop etildi (mahalliy ko‘rinish)",
        description: "Doimiy saqlash uchun tizimga kiring.",
        variant: "success",
      });
      router.push("/");
      return;
    }

    setPublishing(true);
    try {
      const res = await apiClient.createPost({
        postType,
        body: trimmed,
        styleConfig: SIMPLE_STYLE_CONFIG,
        hashtags,
        commentPolicy,
        draftId: activeDraftId,
      });

      if (res.ok) {
        addOrUpdatePostInList(res.data.post);
        toast({ title: "Post chop etildi", variant: "success" });
        router.push("/");
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setPublishing(false);
    }
  }, [
    canPublish,
    auth?.user,
    createLocalFallbackPost,
    postType,
    trimmed,
    hashtags,
    toast,
    router,
    commentPolicy,
    activeDraftId,
    addOrUpdatePostInList,
  ]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    await publishPost();
  };

  useTelegramMainButton({
    text: "Chop etish",
    visible: canPublish,
    enabled: canPublish && !publishing,
    loading: publishing,
    onClick: () => void publishPost(),
  });

  return (
    <AppShell title="Yozish">
      <div className="space-y-4">
        {/* Saved Private Drafts */}
        {savedDrafts.length > 0 ? (
          <GlassCard padding="sm" className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                <FileText className="h-3.5 w-3.5" />
                Shaxsiy qoralamalar ({savedDrafts.length})
              </span>
              <span className="text-[11.5px] text-[var(--text-muted)]">
                Faqat sizga ko‘rinadi
              </span>
            </div>
            <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar pb-1">
              {savedDrafts.map((d) => (
                <div
                  key={d.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--border-matte)] bg-[var(--surface-input)] px-3 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => handleResumeDraft(d)}
                    className="max-w-[180px] truncate text-[12.5px] text-[var(--text-primary)] hover:underline cursor-pointer"
                  >
                    {d.body || "Bo‘sh qoralama"}
                  </button>
                  <button
                    type="button"
                    aria-label="Qoralamani o‘chirish"
                    onClick={() => void handleDeleteDraft(d.id)}
                    className="text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : null}

        <GlassCard padding="lg">
          <form onSubmit={handlePublish} className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <GlassAvatar
                name={auth?.profile?.displayName || "Siz"}
                seed={auth?.profile?.username || "guest"}
                avatarId={auth?.profile?.avatarId}
                size="md"
              />
              <div>
                <div className="font-mono text-[14px] font-semibold text-[var(--text-primary)]">
                  {auth?.profile?.username
                    ? `@${auth.profile.username}`
                    : "Yangi post"}
                </div>
                <div className="font-mono text-[11.5px] text-[var(--text-muted)]">
                  {draftStatus === "saving"
                    ? "Qoralama saqlanmoqda..."
                    : draftStatus === "saved"
                      ? "Qoralama saqlandi"
                      : `Limit: ${maxPostLength} belgi`}
                </div>
              </div>
            </div>

            {/* Comment Policy Select */}
            <GlassSelect
              label="Izohlar tartibi"
              sheetTitle="Kimlar izoh yoza oladi?"
              value={commentPolicy}
              onValueChange={(val) =>
                setCommentPolicy(val as CommentPolicy)
              }
              options={[
                { value: "everyone", label: "Hamma yoza oladi" },
                { value: "followers", label: "Faqat obunachilar" },
                { value: "closed", label: "Izohlar yopilgan" },
              ]}
            />

            {/* Textarea with Configurable Limit (1000+) */}
            <GlassTextarea
              label="Post matni"
              placeholder="Fikringizni yozing..."
              maxLength={maxPostLength}
              rows={6}
              value={body}
              onChange={(e) => {
                const nextBody = e.target.value;
                setBody(nextBody);
                triggerAutoSave({
                  postType,
                  body: nextBody,
                  styleConfig: SIMPLE_STYLE_CONFIG,
                  hashtags,
                });
              }}
              hint={
                limitInfo?.nextMilestoneHint ??
                "Dastlabki limit: 1000 belgi. Haqiqiy do‘stlarni taklif qilish orqali limitni oshirish mumkin."
              }
            />

            {/* Hashtags (Max 3, clean borderless inline tags) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--text-secondary)]">
                  Hashtaglar (maksimum {MAX_HASHTAGS_PER_POST} ta)
                </span>
                <span className="font-mono text-[11.5px] text-[var(--text-muted)]">
                  {hashtags.length}/{MAX_HASHTAGS_PER_POST}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <GlassInput
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddHashtag();
                    }
                  }}
                  placeholder="Masalan: sheriyat"
                  aria-label="Hashtag qo‘shish"
                  leadingIcon={<Hash className="h-4 w-4" />}
                  disabled={hashtags.length >= MAX_HASHTAGS_PER_POST}
                />
                <GlassButton
                  type="button"
                  variant="subtle"
                  size="icon"
                  aria-label="Hashtag qo‘shish tugmasi"
                  onClick={handleAddHashtag}
                  disabled={hashtags.length >= MAX_HASHTAGS_PER_POST}
                  className="h-11 w-11 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </GlassButton>
              </div>

              {hashtags.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
                  {hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 font-mono text-[13px] font-medium text-sky-400"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        aria-label={`#${tag} ni olib tashlash`}
                        onClick={() => handleRemoveHashtag(tag)}
                        className="text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-matte)] pt-4">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={() => router.back()}
              >
                Bekor qilish
              </GlassButton>
              <GlassButton
                type="submit"
                variant="glass"
                loading={publishing}
                disabled={!canPublish}
              >
                <Send className="h-4 w-4" />
                Chop etish
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>
    </AppShell>
  );
}
