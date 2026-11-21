"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Activity, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  useDesignSystem,
} from "@/design-system";
import { apiClient } from "@/lib/api-client";

export default function HelpPage() {
  const { toast } = useDesignSystem();
  const [checking, setChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const res = await apiClient.getHealth();
      if (res.ok) {
        const msg = `Tizim sog‘lom (DB: ${res.data.database.latencyMs}ms)`;
        setHealthStatus(msg);
        toast({ title: msg, variant: "success" });
      } else {
        setHealthStatus(res.error.message);
        toast({ title: res.error.message, variant: "warning" });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <AppShell title="Yordam">
      <GlassCard padding="lg" className="divide-y divide-[var(--border-matte)]">
        <section className="space-y-3 pb-6">
          <div className="flex items-center gap-2">
            <GlassBadge variant="glass">
              <ShieldCheck className="h-3 w-3" />
              Text-Only &amp; RLS
            </GlassBadge>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[18px] font-bold text-[var(--text-primary)]"
          >
            Avero qanday ishlaydi?
          </h1>
          <p className="text-[14.5px] leading-[1.6] text-[var(--text-secondary)]">
            Avero — faqat matnga asoslangan, Web va Telegram Mini App uchun
            yaratilgan ijtimoiy tarmoq. Rasm va video yuklash o‘chirilgan,
            barcha ma’lumotlar PostgreSQL Row Level Security bilan himoyalangan.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <GlassButton
              variant="glass"
              loading={checking}
              onClick={() => void checkHealth()}
            >
              <Activity className="h-4 w-4" />
              API holatini tekshirish
            </GlassButton>

            <Link
              href="/design-system"
              className="liquid-glass liquid-glass-glare glass-focus-ring inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium text-[var(--text-primary)]"
            >
              <Sparkles className="relative z-10 h-4 w-4" />
              <span className="relative z-10">Design System Demo</span>
            </Link>
          </div>

          {healthStatus ? (
            <p className="font-mono text-[12.5px] text-[var(--text-muted)]">
              Natija: {healthStatus}
            </p>
          ) : null}
        </section>

        <section className="space-y-2.5 pt-6">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Tez-tez beriladigan savollar
          </h2>
          <div className="space-y-2.5 text-[13.5px] text-[var(--text-secondary)]">
            <p>
              <strong>Nega rasm/video yuklab bo‘lmaydi?</strong> — Platforma
              shovqinsiz, tezkor va faqat matnli muloqotga ixtisoslashgan.
            </p>
            <p>
              <strong>Google va Telegram akkauntini ulash xavfsizmi?</strong> —
              Ha, bog‘lash faqat sizning aniq roziligingiz va bir martalik
              kriptografik token orqali amalga oshiriladi.
            </p>
          </div>
        </section>
      </GlassCard>
    </AppShell>
  );
}
