import "server-only";
import { eq } from "drizzle-orm";
import {
  computeUnlockedAvatarIds,
  STARTER_AVATAR_IDS,
} from "@/lib/avatars/catalog";
import { type DbTransaction, withDbContext } from "@/server/db/context";
import {
  profiles,
  userActivity,
  users,
  type UserRole,
} from "@/server/db/schema";
import { createNotificationInTx } from "./social.service";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface OwnerActivityStats {
  lastVisitAt: string;
  lastPostAt: string | null;
  lastQualifiedAt: string | null;
  activeThreeDayCycles: number;
  totalVisitsCount: number;
  accountAgeDays: number;
  nextPostDeadlineAt: string;
  withinThreeDayCadence: boolean;
  unlockedAvatars: string[];
}

async function ensureActivityRow(tx: DbTransaction, userId: string) {
  await tx
    .insert(userActivity)
    .values({ userId })
    .onConflictDoNothing();

  const [row] = await tx
    .select()
    .from(userActivity)
    .where(eq(userActivity.userId, userId))
    .limit(1);

  return row!;
}

export async function recordActivityVisitInTx(
  tx: DbTransaction,
  userId: string,
  now = new Date()
): Promise<string[]> {
  const row = await ensureActivityRow(tx, userId);

  const [userRow] = await tx
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [profileRow] = await tx
    .select({ postsCount: profiles.postsCount })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const accountAgeDays = userRow
    ? Math.max(
        0,
        Math.floor((now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000))
      )
    : 0;

  const prevSet = new Set(row.unlockedAvatars ?? STARTER_AVATAR_IDS);
  const unlocked = computeUnlockedAvatarIds({
    previouslyUnlocked: row.unlockedAvatars ?? STARTER_AVATAR_IDS,
    accountAgeDays,
    activeThreeDayCycles: row.activeThreeDayCycles,
    postsCount: profileRow?.postsCount ?? 0,
  });
  const newlyUnlocked = unlocked.filter((id) => !prevSet.has(id));

  await tx
    .update(userActivity)
    .set({
      lastVisitAt: now,
      totalVisitsCount: row.totalVisitsCount + 1,
      unlockedAvatars: unlocked,
      updatedAt: now,
    })
    .where(eq(userActivity.userId, userId));

  if (newlyUnlocked.length > 0) {
    await createNotificationInTx(tx, {
      recipientId: userId,
      actorId: userId,
      type: "avatar_unlocked",
      bodyPreview: newlyUnlocked.join(", "),
    });
  }

  await tx
    .update(profiles)
    .set({ lastSeenAt: now })
    .where(eq(profiles.userId, userId));

  return unlocked;
}

/**
 * Evaluates the 3-day cadence rule when a post is published:
 * User must visit and publish a post at least once every 3 days.
 */
export async function recordActivityPostInTx(
  tx: DbTransaction,
  userId: string,
  now = new Date()
): Promise<{ activeThreeDayCycles: number; unlockedAvatars: string[] }> {
  const row = await ensureActivityRow(tx, userId);

  const [userRow] = await tx
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [profileRow] = await tx
    .select({ postsCount: profiles.postsCount })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const lastQual = row.lastQualifiedAt;
  let nextCycles = row.activeThreeDayCycles;
  let nextQualifiedAt = row.lastQualifiedAt;

  if (!lastQual) {
    nextCycles = 1;
    nextQualifiedAt = now;
  } else {
    const elapsedMs = now.getTime() - lastQual.getTime();
    if (elapsedMs >= THREE_DAYS_MS) {
      // A new 3-day period completed
      nextCycles = row.activeThreeDayCycles + 1;
      nextQualifiedAt = now;
    } else if (elapsedMs >= 24 * 3600 * 1000 && row.activeThreeDayCycles === 0) {
      nextCycles = 1;
      nextQualifiedAt = now;
    }
  }

  const accountAgeDays = userRow
    ? Math.max(
        0,
        Math.floor((now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000))
      )
    : 0;

  const prevSet = new Set(row.unlockedAvatars ?? STARTER_AVATAR_IDS);
  const unlockedAvatars = computeUnlockedAvatarIds({
    previouslyUnlocked: row.unlockedAvatars ?? STARTER_AVATAR_IDS,
    accountAgeDays,
    activeThreeDayCycles: nextCycles,
    postsCount: (profileRow?.postsCount ?? 0) + 1,
  });
  const newlyUnlocked = unlockedAvatars.filter((id) => !prevSet.has(id));

  await tx
    .update(userActivity)
    .set({
      lastVisitAt: now,
      lastPostAt: now,
      lastQualifiedAt: nextQualifiedAt,
      activeThreeDayCycles: nextCycles,
      unlockedAvatars,
      updatedAt: now,
    })
    .where(eq(userActivity.userId, userId));

  if (newlyUnlocked.length > 0) {
    await createNotificationInTx(tx, {
      recipientId: userId,
      actorId: userId,
      type: "avatar_unlocked",
      bodyPreview: newlyUnlocked.join(", "),
    });
  }

  await tx
    .update(profiles)
    .set({ lastSeenAt: now })
    .where(eq(profiles.userId, userId));

  return { activeThreeDayCycles: nextCycles, unlockedAvatars };
}

export async function recordActivityVisit(
  userId: string,
  role: UserRole
): Promise<void> {
  await withDbContext({ userId, role }, async (tx) => {
    await recordActivityVisitInTx(tx, userId);
  });
}

export async function getOwnerActivityStats(
  userId: string,
  role: UserRole
): Promise<OwnerActivityStats> {
  return withDbContext({ userId, role }, async (tx) => {
    const unlocked = await recordActivityVisitInTx(tx, userId);
    const row = await ensureActivityRow(tx, userId);

    const [userRow] = await tx
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const now = new Date();
    const accountAgeDays = userRow
      ? Math.max(
          0,
          Math.floor((now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000))
        )
      : 0;

    const anchor = row.lastPostAt ?? userRow?.createdAt ?? now;
    const deadline = new Date(anchor.getTime() + THREE_DAYS_MS);
    const withinThreeDayCadence =
      Boolean(row.lastPostAt) && now.getTime() - row.lastPostAt!.getTime() <= THREE_DAYS_MS;

    return {
      lastVisitAt: row.lastVisitAt.toISOString(),
      lastPostAt: row.lastPostAt ? row.lastPostAt.toISOString() : null,
      lastQualifiedAt: row.lastQualifiedAt
        ? row.lastQualifiedAt.toISOString()
        : null,
      activeThreeDayCycles: row.activeThreeDayCycles,
      totalVisitsCount: row.totalVisitsCount,
      accountAgeDays,
      nextPostDeadlineAt: deadline.toISOString(),
      withinThreeDayCadence,
      unlockedAvatars: unlocked,
    };
  });
}
