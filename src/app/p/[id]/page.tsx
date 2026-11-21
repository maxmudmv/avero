"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { PostCard } from "@/components/app/post-card";
import { GlassButton, GlassCard } from "@/design-system";
import { apiClient, type ServerPost } from "@/lib/api-client";

export default function SinglePostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = typeof params?.id === "string" ? params.id : "";

  const [post, setPost] = useState<ServerPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    void apiClient
      .getPost(postId)
      .then((res) => {
        if (res.ok) {
          setPost(res.data.post);
        } else {
          setError(res.error.message || "Post topilmadi");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [postId]);

  return (
    <AppShell
      title="Post"
      topAction={
        <GlassButton
          size="sm"
          variant="glass"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Orqaga
        </GlassButton>
      }
    >
      {loading ? (
        <GlassCard padding="md" className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-3.5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded-lg bg-white/[0.05]" />
            <div className="h-3.5 w-4/5 animate-pulse rounded-lg bg-white/[0.05]" />
          </div>
        </GlassCard>
      ) : error || !post ? (
        <GlassCard padding="lg" className="text-center space-y-2">
          <p className="text-[15px] font-medium text-[var(--text-primary)]">
            {error || "Post topilmadi"}
          </p>
        </GlassCard>
      ) : (
        <PostCard post={post} />
      )}
    </AppShell>
  );
}
