"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Lock, Send, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassButton,
  GlassCard,
  GlassInput,
  useDesignSystem,
} from "@/design-system";
import { apiClient, type ServerDmThread } from "@/lib/api-client";

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
  });
}

function MessagesContent() {
  const { toast } = useDesignSystem();
  const { auth, authLoading, t } = useAppState();
  const searchParams = useSearchParams();

  const targetIdParam = searchParams.get("to") ?? "";
  const targetUsernameParam = searchParams.get("username") ?? "";
  const targetNameParam = searchParams.get("name") ?? "";

  const [threads, setThreads] = useState<ServerDmThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    if (authLoading) return;
    if (!auth?.user) {
      setThreads([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.getDmThreads();
      if (res.ok) {
        let list = res.data.threads;

        if (
          targetIdParam &&
          targetIdParam !== auth.user.id &&
          !list.some((item) => item.partner.userId === targetIdParam)
        ) {
          const virtualThread: ServerDmThread = {
            id: `new_${targetIdParam}`,
            status: "pending",
            initiatedBy: auth.user.id,
            isIncomingRequest: false,
            lastMessageAt: new Date().toISOString(),
            partner: {
              userId: targetIdParam,
              username: targetUsernameParam || "foydalanuvchi",
              displayName: targetNameParam || targetUsernameParam || "Foydalanuvchi",
              avatarId: "av_01",
            },
            messages: [],
          };
          list = [virtualThread, ...list];
        }

        setThreads(list);
        if (targetIdParam) {
          const found = list.find((item) => item.partner.userId === targetIdParam);
          if (found) setSelectedId(found.id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [auth?.user, authLoading, targetIdParam, targetNameParam, targetUsernameParam]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const active = selectedId
    ? threads.find((item) => item.id === selectedId) ?? null
    : null;

  useEffect(() => {
    if (active) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [active?.id, active?.messages.length, active]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !active || !auth?.user) return;

    setSending(true);
    try {
      const res = await apiClient.sendDm(active.partner.userId, trimmed);
      if (res.ok) {
        setDraft("");
        await loadThreads();
        setSelectedId(res.data.threadId);
      } else {
        toast({ title: res.error.message, variant: "error" });
      }
    } finally {
      setSending(false);
    }
  };

  const handleRequestAction = async (
    threadId: string,
    action: "accept" | "decline"
  ) => {
    const res = await apiClient.respondDmRequest(threadId, action);
    if (res.ok) {
      toast({
        title:
          action === "accept"
            ? "Xabar so‘rovi qabul qilindi"
            : "Xabar so‘rovi rad etildi",
        variant: "success",
      });
      await loadThreads();
    } else {
      toast({ title: res.error.message, variant: "error" });
    }
  };

  const canComposeInActive = Boolean(
    active &&
      active.status !== "declined" &&
      !active.isIncomingRequest &&
      auth?.user
  );

  return (
    <AppShell title={t.menu.messages}>
      {authLoading || (loading && threads.length === 0) ? (
        <GlassCard padding="none" className="divide-y divide-[var(--border-matte)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-44 animate-pulse rounded bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </GlassCard>
      ) : !auth?.user ? (
        <GlassCard padding="lg" className="text-center space-y-2">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            {t.menu.signInPrompt}
          </p>
        </GlassCard>
      ) : active && typeof document !== "undefined" ? (
        /* 2. FULL-SCREEN CHAT VIEW (Instagram DM style full screen overlay) */
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg-canvas)]">
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
              {/* Chat top bar with Back button + partner profile link */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-matte)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    aria-label="Orqaga"
                    onClick={() => setSelectedId(null)}
                    className="glass-focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--glass-fill-subtle)] cursor-pointer"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <Link
                    href={`/u/${encodeURIComponent(active.partner.username)}`}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <GlassAvatar
                      name={active.partner.displayName}
                      seed={active.partner.username}
                      avatarId={active.partner.avatarId}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
                        {active.partner.displayName}
                      </div>
                      <div className="truncate text-[12px] text-[var(--text-muted)]">
                        @{active.partner.username}
                      </div>
                    </div>
                  </Link>
                </div>

                {active.status === "pending" ? (
                  <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">
                    So‘rov
                  </span>
                ) : active.status === "declined" ? (
                  <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">
                    Rad etilgan
                  </span>
                ) : null}
              </div>

              {/* Messages stream */}
              <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
                {active.messages.length === 0 ? (
                  <p className="py-16 text-center text-[13.5px] text-[var(--text-muted)]">
                    @{active.partner.username} bilan suhbatni boshlang.
                  </p>
                ) : (
                  active.messages.map((msg) => {
                    const fromMe = msg.senderId === auth.user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed ${
                            fromMe
                              ? "bg-[var(--text-primary)] text-[var(--bg-canvas)]"
                              : "border border-[var(--border-matte)] bg-[var(--surface-input)] text-[var(--text-primary)]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {msg.body}
                          </p>
                          <span
                            className={`mt-0.5 block text-right text-[10.5px] ${
                              fromMe
                                ? "opacity-70"
                                : "text-[var(--text-muted)]"
                            }`}
                          >
                            {formatShortTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom composer or incoming request bar */}
              <div
                style={{
                  paddingBottom:
                    "max(0.75rem, env(safe-area-inset-bottom, 0px), var(--tg-safe-bottom, 0px))",
                }}
                className="shrink-0 border-t border-[var(--border-matte)] bg-[var(--bg-canvas)] px-4 pt-3"
              >
                {active.isIncomingRequest ? (
                  <div className="space-y-2.5">
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      @{active.partner.username} sizga xabar so‘rovi yubordi.
                    </p>
                    <div className="flex items-center gap-2">
                      <GlassButton
                        size="sm"
                        variant="glass"
                        onClick={() => void handleRequestAction(active.id, "accept")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Qabul qilish
                      </GlassButton>
                      <GlassButton
                        size="sm"
                        variant="glass"
                        className="text-rose-400"
                        onClick={() => void handleRequestAction(active.id, "decline")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rad etish
                      </GlassButton>
                    </div>
                  </div>
                ) : active.status === "declined" ? (
                  <div className="flex items-center gap-2 py-1 text-[13px] text-[var(--text-muted)]">
                    <Lock className="h-3.5 w-3.5" />
                    Ushbu xabar so‘rovi rad etilgan.
                  </div>
                ) : canComposeInActive ? (
                  <form
                    onSubmit={handleSend}
                    className="flex items-center gap-2"
                  >
                    <GlassInput
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Xabar yozing..."
                      aria-label="Xabar matni"
                      maxLength={1000}
                    />
                    <GlassButton
                      type="submit"
                      variant="glass"
                      size="icon"
                      aria-label="Yuborish"
                      loading={sending}
                      disabled={!draft.trim()}
                      className="h-11 w-11 shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </GlassButton>
                  </form>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )
      ) : threads.length === 0 ? (
        <GlassCard padding="lg" className="text-center space-y-1.5">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            Hali xabarlar yo‘q
          </p>
          <p className="text-[13px] text-[var(--text-muted)]">
            Istalgan foydalanuvchi profilidan «Xabar» tugmasini bosib suhbat boshlang.
          </p>
        </GlassCard>
      ) : (
        /* 1. INSTAGRAM-STYLE INBOX LIST (only conversation rows, tap to open) */
        <GlassCard padding="none" className="divide-y divide-[var(--border-matte)] overflow-hidden">
          {threads.map((thread) => {
            const lastMsg = thread.messages[thread.messages.length - 1];
            const fromMe = lastMsg?.senderId === auth.user?.id;
            const previewText = lastMsg
              ? `${fromMe ? "Siz: " : ""}${lastMsg.body}`
              : thread.status === "pending"
                ? "Xabar so‘rovi"
                : "Yangi suhbat";
            const timeText = formatShortTime(
              lastMsg?.createdAt ?? thread.lastMessageAt
            );

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelectedId(thread.id)}
                className="glass-focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--glass-fill-subtle)] cursor-pointer"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <GlassAvatar
                    name={thread.partner.displayName}
                    seed={thread.partner.username}
                    avatarId={thread.partner.avatarId}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-[var(--text-primary)]">
                        {thread.partner.displayName}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">
                        {timeText}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-[var(--text-muted)]">
                        {previewText}
                      </p>
                      {thread.isIncomingRequest ? (
                        <span className="shrink-0 rounded-full bg-[var(--text-primary)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--bg-canvas)]">
                          So‘rov
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </button>
            );
          })}
        </GlassCard>
      )}
    </AppShell>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Xabarlar">
          <div className="h-40 rounded-3xl border border-[var(--border-matte)] bg-[var(--surface-card)] animate-pulse" />
        </AppShell>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
