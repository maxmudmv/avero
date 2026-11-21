import "server-only";
import { eq } from "drizzle-orm";
import {
  computeUnlockedAvatarIds,
  getAvatarById,
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
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Returns YYYY-MM-DD in Asia/Tashkent (UTC+5) so each distinct active calendar day
 * unlocks exactly +1 new avatar at midnight local time.
 */
export function getActiveDayKey(now = new Date()): string {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface OwnerActivityStats {
  lastVisitAt: string;
  lastPostAt: string | null;
  lastQualifiedAt: string | null;
  activeThreeDayCycles: number;
  activeDaysCount: number;
  totalVisitsCount: number;
  accountAgeDays: number;
  nextPostDeadlineAt: string;
  withinThreeDayCadence: boolean;
  unlockedAvatars: string[];
}

async function ensureActivityRow(tx: DbTransaction, userId: string) {
  await tx
    .insert(userActivity)
    .values({
      userId,
      activeDaysCount: 1,
      lastActiveDay: getActiveDayKey(),
      unlockedAvatars: STARTER_AVATAR_IDS,
    })
    .onConflictDoNothing();

  const [row] = await tx
    .select()
    .from(userActivity)
    .where(eq(userActivity.userId, userId))
    .limit(1);

  return row!;
}

function advanceActiveDayCounter(
  row: { activeDaysCount: number; lastActiveDay: string | null },
  now: Date
): { activeDaysCount: number; lastActiveDay: string } {
  const todayKey = getActiveDayKey(now);
  if (!row.lastActiveDay) {
    return {
      activeDaysCount: Math.max(1, row.activeDaysCount || 1),
      lastActiveDay: todayKey,
    };
  }
  if (row.lastActiveDay === todayKey) {
    return {
      activeDaysCount: Math.max(1, row.activeDaysCount || 1),
      lastActiveDay: todayKey,
    };
  }
  return {
    activeDaysCount: Math.max(1, row.activeDaysCount || 1) + 1,
    lastActiveDay: todayKey,
  };
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
        Math.floor(
          (now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000)
        )
      )
    : 0;

  const { activeDaysCount, lastActiveDay } = advanceActiveDayCounter(row, now);
  const prevList =
    row.unlockedAvatars && row.unlockedAvatars.length > 0
      ? row.unlockedAvatars
      : STARTER_AVATAR_IDS;
  const prevSet = new Set(prevList);

  const unlocked = computeUnlockedAvatarIds({
    previouslyUnlocked: prevList,
    activeDaysCount,
    accountAgeDays,
    activeThreeDayCycles: row.activeThreeDayCycles,
    postsCount: profileRow?.postsCount ?? 0,
  });
  const newlyUnlocked = unlocked.filter((id) => !prevSet.has(id));

  await tx
    .update(userActivity)
    .set({
      lastVisitAt: now,
      activeDaysCount,
      lastActiveDay,
      totalVisitsCount: row.totalVisitsCount + 1,
      unlockedAvatars: unlocked,
      updatedAt: now,
    })
    .where(eq(userActivity.userId, userId));

  if (newlyUnlocked.length > 0) {
    const unlockedNames = newlyUnlocked
      .map((id) => getAvatarById(id).name)
      .join(", ");
    await createNotificationInTx(tx, {
      recipientId: userId,
      actorId: userId,
      type: "avatar_unlocked",
      bodyPreview: unlockedNames,
    });
  }

  await tx
    .update(profiles)
    .set({ lastSeenAt: now })
    .where(eq(profiles.userId, userId));

  return unlocked;
}

/**
 * Updates daily active avatar unlock progress and 3-day cadence when a post is published.
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
        Math.floor(
          (now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000)
        )
      )
    : 0;

  const { activeDaysCount, lastActiveDay } = advanceActiveDayCounter(row, now);
  const prevList =
    row.unlockedAvatars && row.unlockedAvatars.length > 0
      ? row.unlockedAvatars
      : STARTER_AVATAR_IDS;
  const prevSet = new Set(prevList);

  const unlockedAvatars = computeUnlockedAvatarIds({
    previouslyUnlocked: prevList,
    activeDaysCount,
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
      activeDaysCount,
      lastActiveDay,
      unlockedAvatars,
      updatedAt: now,
    })
    .where(eq(userActivity.userId, userId));

  if (newlyUnlocked.length > 0) {
    const unlockedNames = newlyUnlocked
      .map((id) => getAvatarById(id).name)
      .join(", ");
    await createNotificationInTx(tx, {
      recipientId: userId,
      actorId: userId,
      type: "avatar_unlocked",
      bodyPreview: unlockedNames,
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
          Math.floor(
            (now.getTime() - userRow.createdAt.getTime()) / (24 * 3600 * 1000)
          )
        )
      : 0;

    const anchor = row.lastPostAt ?? userRow?.createdAt ?? now;
    const deadline = new Date(anchor.getTime() + THREE_DAYS_MS);
    const withinThreeDayCadence =
      Boolean(row.lastPostAt) &&
      now.getTime() - row.lastPostAt!.getTime() <= THREE_DAYS_MS;

    return {
      lastVisitAt: row.lastVisitAt.toISOString(),
      lastPostAt: row.lastPostAt ? row.lastPostAt.toISOString() : null,
      lastQualifiedAt: row.lastQualifiedAt
        ? row.lastQualifiedAt.toISOString()
        : null,
      activeThreeDayCycles: row.activeThreeDayCycles,
      activeDaysCount: Math.max(1, row.activeDaysCount || 1),
      totalVisitsCount: row.totalVisitsCount,
      accountAgeDays,
      nextPostDeadlineAt: deadline.toISOString(),
      withinThreeDayCadence,
      unlockedAvatars: unlocked,
    };
  });
}
