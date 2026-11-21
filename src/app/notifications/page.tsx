"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import {
  useAppState,
  type NotificationItem,
} from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassButton,
  GlassCard,
  GlassTab,
  GlassTabs,
  useDesignSystem,
} from "@/design-system";

function resolveNotificationHref(item: NotificationItem): string {
  if (item.postId) {
    return `/p/${encodeURIComponent(item.postId)}`;
  }
  switch (item.type) {
    case "dm":
    case "dm_request":
      return item.actorId
        ? `/messages?to=${encodeURIComponent(item.actorId)}&username=${encodeURIComponent(item.actorUsername)}&name=${encodeURIComponent(item.actorName)}`
        : "/messages";
    case "follow":
      return item.actorUsername && item.actorUsername !== "system"
        ? `/u/${encodeURIComponent(item.actorUsername)}`
        : "/profile";
    case "follow_request":
    case "avatar_unlocked":
      return "/profile";
    case "warning":
    case "appeal":
      return "/settings";
    default:
      return item.actorUsername && item.actorUsername !== "system"
        ? `/u/${encodeURIComponent(item.actorUsername)}`
        : "/";
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useDesignSystem();
  const {
    notifications,
    unreadCount,
    refreshNotifications,
    markAllNotificationsRead,
  } = useAppState();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const visible =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const handleOpenNotification = (item: NotificationItem) => {
    if (!item.read) {
      markAllNotificationsRead();
    }
    router.push(resolveNotificationHref(item));
  };

  return (
    <AppShell
      title="Bildirishnomalar"
      topAction={
        unreadCount > 0 ? (
          <GlassButton
            size="sm"
            variant="glass"
            onClick={() => {
              markAllNotificationsRead();
              toast({
                title: "Barchasi o‘qilgan deb belgilandi",
                variant: "success",
              });
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            O‘qildi
          </GlassButton>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <GlassTabs
          value={filter}
          onValueChange={setFilter}
          ariaLabel="Bildirishnoma filtrlari"
          fullWidth
        >
          <GlassTab value="all">Hammasi ({notifications.length})</GlassTab>
          <GlassTab value="unread">O‘qilmagan ({unreadCount})</GlassTab>
        </GlassTabs>

        {visible.length === 0 ? (
          <GlassCard padding="lg" className="text-center">
            <p className="text-[14.5px] text-[var(--text-secondary)]">
              Yangi bildirishnomalar yo‘q.
            </p>
          </GlassCard>
        ) : (
          <GlassCard
            padding="none"
            className="divide-y divide-[var(--border-matte)] overflow-hidden"
          >
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenNotification(item)}
                className="glass-focus-ring flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--glass-fill-subtle)] cursor-pointer"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <GlassAvatar
                    name={item.actorName}
                    seed={item.actorUsername}
                    avatarId={item.actorAvatarId}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
                        {item.actorUsername !== "system"
                          ? `@${item.actorUsername}`
                          : item.actorName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!item.read ? (
                          <span
                            aria-label="Yangi"
                            className="h-2 w-2 rounded-full bg-[var(--text-primary)]"
                          />
                        ) : null}
                        <span className="text-[11.5px] text-[var(--text-muted)]">
                          {item.timeLabel}
                        </span>
                      </div>
                    </div>

                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                      {item.text}
                    </p>

                    {item.postSnippet ? (
                      <p className="mt-1.5 truncate border-l-2 border-[var(--border-matte-hover)] pl-2.5 text-[12.5px] text-[var(--text-muted)]">
                        {item.postSnippet}
                      </p>
                    ) : null}
                  </div>
                </div>

                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </button>
            ))}
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}
