"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { useAppState } from "@/components/app/app-state-provider";
import {
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassTab,
  GlassTabs,
  useDesignSystem,
} from "@/design-system";

export default function NotificationsPage() {
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

  return (
    <AppShell
      title="Bildirishnomalar"
      topAction={
        unreadCount > 0 ? (
          <GlassButton
            size="sm"
            variant="subtle"
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
          <div className="space-y-2.5">
            {visible.map((item) => (
              <GlassCard
                key={item.id}
                padding="sm"
                className="flex items-start gap-3"
              >
                <GlassAvatar
                  name={item.actorName}
                  seed={item.actorUsername}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={
                        item.actorUsername !== "system"
                          ? `/u/${encodeURIComponent(item.actorUsername)}`
                          : "/"
                      }
                      className="text-[14px] font-semibold text-[var(--text-primary)] hover:underline"
                    >
                      {item.actorName}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      {!item.read ? (
                        <GlassBadge variant="accent">Yangi</GlassBadge>
                      ) : null}
                      <span className="text-[11.5px] text-[var(--text-muted)]">
                        {item.timeLabel}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                    {item.text}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
