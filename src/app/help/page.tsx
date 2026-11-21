"use client";

import React from "react";
import { AppShell } from "@/components/app/app-shell";
import { GlassCard } from "@/design-system";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Nega rasm va video yo‘q?",
    a: "Avero — so‘z uchun joy. Faqat matn: shovqinsiz va tez.",
  },
  {
    q: "Post uzunligi qancha bo‘lishi mumkin?",
    a: "Har bir taklif qilgan do‘stingiz uchun post limitingizga yana 25 belgi qo‘shiladi.",
  },
  {
    q: "Yangi avatarlar qanday ochiladi?",
    a: "Ilovaga kirgan har bir kuningiz uchun bitta yangi avatar ochiladi.",
  },
  {
    q: "Google va Telegramni ulash xavfsizmi?",
    a: "Ha. Akkauntlar faqat siz rozilik bersangiz va bir martalik havola orqali bog‘lanadi.",
  },
];

export default function HelpPage() {
  return (
    <AppShell title="Yordam">
      <GlassCard padding="lg" className="divide-y divide-[var(--border-matte)]">
        <section className="space-y-2 pb-5">
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-[18px] font-bold text-[var(--text-primary)]"
          >
            Avero haqida
          </h1>
          <p className="text-[14.5px] leading-[1.6] text-[var(--text-secondary)]">
            Avero — fikrlar matn bilan almashiladigan ijtimoiy tarmoq. Web
            brauzerda ham, Telegram ichida ham ishlaydi.
          </p>
        </section>

        {FAQ.map((item) => (
          <section key={item.q} className="space-y-1 py-4 last:pb-0">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {item.q}
            </h2>
            <p className="text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
              {item.a}
            </p>
          </section>
        ))}
      </GlassCard>
    </AppShell>
  );
}
