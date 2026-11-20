"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Lock, Send, X } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  useDesignSystem,
} from "@/design-system";
import { apiClient, type ServerDmThread } from "@/lib/api-client";

const DEMO_THREADS: ServerDmThread[] = [
  {
    id: "demo_1",
    status: "accepted",
    initiatedBy: "other",
    isIncomingRequest: false,
    lastMessageAt: new Date().toISOString(),
    partner: {
      userId: "demo_u1",
      username: "azizbek",
      displayName: "Azizbek Karimov",
      avatarId: "av_01",
    },
    messages: [
      {
        id: "m_1",
        senderId: "demo_u1",
        body: "Salom! Yangi matnli lenta dizayni juda toza chiqibdi.",
        createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
      },
      {
        id: "m_2",
        senderId: "me",
        body: "Rahmat! OLED Matte va Liquid Glass ustida ishlayapmiz.",
        createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
      },
    ],
  },
];

function MessagesContent() {
  const { toast } = useDesignSystem();
  const { auth } = useAppState();
  const searchParams = useSearchParams();

  const targetIdParam = searchParams.get("to") ?? "";
  const targetUsernameParam = searchParams.get("username") ?? "";
  const targetNameParam = searchParams.get("name") ?? "";

  const [threads, setThreads] = useState<ServerDmThread[]>(DEMO_THREADS);
  const [activeId, setActiveId] = useState<string>("demo_1");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!auth?.user) {
      setThreads(DEMO_THREADS);
      setActiveId("demo_1");
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
          !list.some((t) => t.partner.userId === targetIdParam)
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
              displayName: targetNameParam || "Yangi suhbat",
              avatarId: "av_01",
            },
            messages: [],
          };
          list = [virtualThread, ...list];
        }

        setThreads(list);
        if (targetIdParam) {
          const found = list.find((t) => t.partner.userId === targetIdParam);
          if (found) setActiveId(found.id);
        } else if (list[0]) {
          setActiveId((prev) =>
            list.some((t) => t.id === prev) ? prev : list[0]!.id
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, [auth?.user, targetIdParam, targetNameParam, targetUsernameParam]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0] ?? null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !active) return;

    if (!auth?.user || active.id.startsWith("demo_")) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === active.id
            ? {
                ...t,
                messages: [
                  ...t.messages,
                  {
                    id: `m_${Date.now()}`,
                    senderId: "me",
                    body: trimmed,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : t
        )
      );
      setDraft("");
      toast({ title: "Xabar yuborildi (demo)", variant: "success" });
      return;
    }

    setSending(true);
    try {
      const res = await apiClient.sendDm(active.partner.userId, trimmed);
      if (res.ok) {
        setDraft("");
        toast({
          title:
            res.data.threadStatus === "pending" && active.messages.length === 0
              ? "Xabar so‘rovi yuborildi"
              : "Xabar yuborildi",
          variant: "success",
        });
        await loadThreads();
        setActiveId(res.data.threadId);
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
      (!active.isIncomingRequest || !auth?.user)
  );

  return (
    <AppShell title="Xabarlar">
      {!auth?.user ? (
        <GlassCard padding="sm" className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-[var(--text-secondary)]">
            Haqiqiy matnli xabarlar va xabar so‘rovlari uchun tizimga kiring.
          </span>
        </GlassCard>
      ) : null}

      {loading && threads.length === 0 ? (
        <GlassCard padding="lg" className="text-center text-[13.5px] text-[var(--text-muted)]">
          Xabarlar yuklanmoqda...
        </GlassCard>
      ) : threads.length === 0 ? (
        <GlassCard padding="lg" className="text-center space-y-2">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            Hali xabarlar yo‘q
          </p>
          <p className="text-[13px] text-[var(--text-muted)]">
            Biror foydalanuvchi profilidan “Xabar yozish” tugmasini bosing. Birinchi xabar xabar so‘rovi sifatida yuboriladi.
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-[230px_1fr]">
          {/* Conversations list */}
          <GlassCard padding="sm" className="space-y-1.5">
            {threads.map((thread) => {
              const isCurrent = thread.id === active?.id;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveId(thread.id)}
                  className={`glass-focus-ring flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? "liquid-glass text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--glass-fill-subtle)]"
                  }`}
                >
                  <GlassAvatar
                    name={thread.partner.displayName}
                    seed={thread.partner.username}
                    avatarId={thread.partner.avatarId}
                    size="sm"
                  />
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[13.5px] font-semibold">
                        {thread.partner.displayName}
                      </span>
                      {thread.status === "pending" ? (
                        <GlassBadge variant="accent">So‘rov</GlassBadge>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                      @{thread.partner.username}
                    </div>
                  </div>
                </button>
              );
            })}
          </GlassCard>

          {/* Thread view */}
          {active ? (
            <GlassCard padding="md" className="flex min-h-[380px] flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-matte)] pb-3">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {active.partner.displayName}
                  </div>
                  <div className="font-mono text-[12px] text-[var(--text-muted)]">
                    @{active.partner.username} · Faqat matn (rasm/video yo‘q)
                  </div>
                </div>
                {active.status === "pending" ? (
                  <GlassBadge variant="accent">Xabar so‘rovi</GlassBadge>
                ) : active.status === "declined" ? (
                  <GlassBadge variant="matte">Rad etilgan</GlassBadge>
                ) : null}
              </div>

              <div className="flex-1 space-y-2.5 py-4">
                {active.messages.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">
                    Birinchi xabaringiz @{active.partner.username} ga xabar so‘rovi sifatida yuboriladi.
                  </p>
                ) : (
                  active.messages.map((msg) => {
                    const fromMe = auth?.user
                      ? msg.senderId === auth.user.id
                      : msg.senderId === "me";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                            fromMe
                              ? "liquid-glass text-[var(--text-primary)]"
                              : "border border-[var(--border-matte)] bg-[var(--surface-input)] text-[var(--text-secondary)]"
                          }`}
                        >
                          <p className="relative z-10 whitespace-pre-wrap break-words">
                            {msg.body}
                          </p>
                          <span className="relative z-10 mt-1 block text-right font-mono text-[10.5px] text-[var(--text-muted)]">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {active.isIncomingRequest ? (
                <div className="space-y-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3.5">
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    @{active.partner.username} sizga ilk bor xabar so‘rovi yubordi. Suhbatni davom ettirish uchun qabul qiling yoki rad eting.
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
                      variant="danger"
                      onClick={() =>
                        void handleRequestAction(active.id, "decline")
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      Rad etish
                    </GlassButton>
                  </div>
                </div>
              ) : active.status === "declined" ? (
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-matte)] p-3 text-[12.5px] text-[var(--text-muted)]">
                  <Lock className="h-3.5 w-3.5" />
                  Ushbu xabar so‘rovi rad etilgan.
                </div>
              ) : canComposeInActive ? (
                <form onSubmit={handleSend} className="flex items-center gap-2 pt-2">
                  <GlassInput
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Matnli xabar yozing (1-1000 belgi)..."
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
            </GlassCard>
          ) : null}
        </div>
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
