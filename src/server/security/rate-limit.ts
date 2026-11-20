import "server-only";
import { getServerEnv } from "@/lib/env";

export interface RateLimitRule {
  id: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtEpochSeconds: number;
  retryAfterSeconds: number;
  backend: "upstash" | "memory";
}

interface MemoryBucket {
  timestamps: number[];
}

const memoryStore = new Map<string, MemoryBucket>();

export function clearMemoryRateLimits(): void {
  memoryStore.clear();
}

function checkMemoryRateLimit(
  key: string,
  rule: RateLimitRule
): RateLimitResult {
  const nowMs = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const cutoffMs = nowMs - windowMs;

  let bucket = memoryStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    memoryStore.set(key, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoffMs);

  const oldestTs = bucket.timestamps[0] ?? nowMs;
  const resetAtEpochSeconds = Math.ceil((oldestTs + windowMs) / 1000);

  if (bucket.timestamps.length >= rule.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestTs + windowMs - nowMs) / 1000)
    );
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      resetAtEpochSeconds,
      retryAfterSeconds,
      backend: "memory",
    };
  }

  bucket.timestamps.push(nowMs);
  return {
    allowed: true,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - bucket.timestamps.length),
    resetAtEpochSeconds,
    retryAfterSeconds: 0,
    backend: "memory",
  };
}

async function checkUpstashRateLimit(
  key: string,
  rule: RateLimitRule,
  restUrl: string,
  restToken: string
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const cutoffMs = nowMs - windowMs;
  const member = `${nowMs}:${Math.random().toString(36).slice(2, 10)}`;
  const redisKey = `rl:${rule.id}:${key}`;

  const pipeline = [
    ["ZREMRANGEBYSCORE", redisKey, "0", String(cutoffMs)],
    ["ZCARD", redisKey],
    ["ZADD", redisKey, String(nowMs), member],
    ["PEXPIRE", redisKey, String(windowMs)],
  ];

  const response = await fetch(`${restUrl.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pipeline),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis error: HTTP ${response.status}`);
  }

  const results = (await response.json()) as Array<{ result?: number }>;
  const currentCount = Number(results[1]?.result ?? 0);
  const resetAtEpochSeconds = Math.ceil((nowMs + windowMs) / 1000);

  if (currentCount >= rule.limit) {
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      resetAtEpochSeconds,
      retryAfterSeconds: rule.windowSeconds,
      backend: "upstash",
    };
  }

  return {
    allowed: true,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - (currentCount + 1)),
    resetAtEpochSeconds,
    retryAfterSeconds: 0,
    backend: "upstash",
  };
}

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const env = getServerEnv();
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await checkUpstashRateLimit(
        key,
        rule,
        env.UPSTASH_REDIS_REST_URL,
        env.UPSTASH_REDIS_REST_TOKEN
      );
    } catch {
      // Fail-open to local memory bucket rather than breaking auth availability
      return checkMemoryRateLimit(`${rule.id}:${key}`, rule);
    }
  }

  return checkMemoryRateLimit(`${rule.id}:${key}`, rule);
}

export const RATE_LIMIT_RULES = {
  AUTH_FLOW: {
    id: "auth_flow",
    limit: 20,
    windowSeconds: 300,
  },
  ACCOUNT_LINK: {
    id: "account_link",
    limit: 10,
    windowSeconds: 600,
  },
  EMAIL_VERIFY: {
    id: "email_verify",
    limit: 5,
    windowSeconds: 600,
  },
  API_GENERAL: {
    id: "api_general",
    limit: 120,
    windowSeconds: 60,
  },
} as const satisfies Record<string, RateLimitRule>;
