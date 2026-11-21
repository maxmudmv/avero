export type AvatarCategory = "illustration" | "abstract" | "minimal";

export interface AvatarCatalogItem {
  id: string;
  name: string;
  category: AvatarCategory;
  starterUnlocked: boolean;
  minActiveDays?: number;
  minAccountDays: number;
  minActiveCycles: number;
  minPostsCount: number;
  unlockRequirementText: string;
  bgGradient: string;
  accentColor: string;
  secondaryColor: string;
  glyphVariant: number;
}

const RAW_AVATAR_CATALOG: AvatarCatalogItem[] = [
  // --- 10 Illustration ---
  {
    id: "av_01",
    name: "Tulki",
    category: "illustration",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-amber-500/30 via-orange-500/20 to-rose-500/25",
    accentColor: "#fbbf24",
    secondaryColor: "#fb7185",
    glyphVariant: 1,
  },
  {
    id: "av_02",
    name: "Boyqush",
    category: "illustration",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-indigo-500/30 via-sky-500/20 to-cyan-400/25",
    accentColor: "#7dd3fc",
    secondaryColor: "#818cf8",
    glyphVariant: 2,
  },
  {
    id: "av_03",
    name: "Tungi Mushuk",
    category: "illustration",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-violet-500/30 via-fuchsia-500/20 to-sky-400/20",
    accentColor: "#c4b5fd",
    secondaryColor: "#38bdf8",
    glyphVariant: 3,
  },
  {
    id: "av_04",
    name: "Kosmonavt",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 3,
    minActiveCycles: 1,
    minPostsCount: 1,
    unlockRequirementText: "3 kun + 1 ta 3 kunlik faollik sikli",
    bgGradient: "from-sky-500/30 via-blue-600/25 to-indigo-500/25",
    accentColor: "#bae6fd",
    secondaryColor: "#60a5fa",
    glyphVariant: 4,
  },
  {
    id: "av_05",
    name: "Tog‘ Cho‘qqisi",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 3,
    minActiveCycles: 1,
    minPostsCount: 2,
    unlockRequirementText: "3 kun + 1 faollik sikli va 2 post",
    bgGradient: "from-emerald-500/28 via-teal-500/20 to-sky-500/20",
    accentColor: "#5eead4",
    secondaryColor: "#93c5fd",
    glyphVariant: 5,
  },
  {
    id: "av_06",
    name: "Okean To‘lqini",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 7,
    minActiveCycles: 2,
    minPostsCount: 3,
    unlockRequirementText: "7 kun + 2 faollik sikli va 3 post",
    bgGradient: "from-cyan-500/30 via-sky-500/25 to-blue-500/20",
    accentColor: "#67e8f9",
    secondaryColor: "#38bdf8",
    glyphVariant: 6,
  },
  {
    id: "av_07",
    name: "Nilufar",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 7,
    minActiveCycles: 2,
    minPostsCount: 4,
    unlockRequirementText: "7 kun + 2 faollik sikli va 4 post",
    bgGradient: "from-rose-400/28 via-pink-500/20 to-violet-500/20",
    accentColor: "#fda4af",
    secondaryColor: "#f472b6",
    glyphVariant: 7,
  },
  {
    id: "av_08",
    name: "Quyosh Qushi",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 14,
    minActiveCycles: 4,
    minPostsCount: 6,
    unlockRequirementText: "14 kun + 4 faollik sikli va 6 post",
    bgGradient: "from-orange-500/30 via-rose-500/25 to-amber-400/25",
    accentColor: "#fdba74",
    secondaryColor: "#fb7185",
    glyphVariant: 8,
  },
  {
    id: "av_09",
    name: "Kiber Bot",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 21,
    minActiveCycles: 6,
    minPostsCount: 10,
    unlockRequirementText: "21 kun + 6 faollik sikli va 10 post",
    bgGradient: "from-teal-500/28 via-emerald-500/20 to-sky-500/25",
    accentColor: "#6ee7b7",
    secondaryColor: "#7dd3fc",
    glyphVariant: 9,
  },
  {
    id: "av_10",
    name: "Quyosh Gerbi",
    category: "illustration",
    starterUnlocked: false,
    minAccountDays: 30,
    minActiveCycles: 8,
    minPostsCount: 15,
    unlockRequirementText: "30 kun + 8 faollik sikli va 15 post",
    bgGradient: "from-amber-400/32 via-yellow-500/20 to-orange-500/25",
    accentColor: "#fde047",
    secondaryColor: "#fb923c",
    glyphVariant: 10,
  },

  // --- 10 Abstract ---
  {
    id: "av_11",
    name: "Liquid Prism",
    category: "abstract",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-sky-400/30 via-violet-400/22 to-teal-300/25",
    accentColor: "#e0f2fe",
    secondaryColor: "#7dd3fc",
    glyphVariant: 11,
  },
  {
    id: "av_12",
    name: "Aurora Nur",
    category: "abstract",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-emerald-400/28 via-sky-500/22 to-indigo-500/25",
    accentColor: "#5eead4",
    secondaryColor: "#a5b4fc",
    glyphVariant: 12,
  },
  {
    id: "av_13",
    name: "Tumanlik",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 3,
    minActiveCycles: 1,
    minPostsCount: 1,
    unlockRequirementText: "3 kun + 1 ta 3 kunlik faollik sikli",
    bgGradient: "from-fuchsia-500/28 via-indigo-500/22 to-cyan-400/20",
    accentColor: "#f0abfc",
    secondaryColor: "#67e8f9",
    glyphVariant: 13,
  },
  {
    id: "av_14",
    name: "Spiral",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 6,
    minActiveCycles: 2,
    minPostsCount: 2,
    unlockRequirementText: "6 kun + 2 faollik sikli va 2 post",
    bgGradient: "from-blue-500/30 via-cyan-400/20 to-teal-400/25",
    accentColor: "#93c5fd",
    secondaryColor: "#5eead4",
    glyphVariant: 14,
  },
  {
    id: "av_15",
    name: "Kristall",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 9,
    minActiveCycles: 3,
    minPostsCount: 4,
    unlockRequirementText: "9 kun + 3 faollik sikli va 4 post",
    bgGradient: "from-cyan-400/30 via-sky-400/20 to-indigo-400/25",
    accentColor: "#cffafe",
    secondaryColor: "#38bdf8",
    glyphVariant: 15,
  },
  {
    id: "av_16",
    name: "Aks-Sado",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 12,
    minActiveCycles: 3,
    minPostsCount: 5,
    unlockRequirementText: "12 kun + 3 faollik sikli va 5 post",
    bgGradient: "from-violet-500/28 via-purple-500/22 to-rose-400/20",
    accentColor: "#ddd6fe",
    secondaryColor: "#f9a8d4",
    glyphVariant: 16,
  },
  {
    id: "av_17",
    name: "Kaleydoskop",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 15,
    minActiveCycles: 4,
    minPostsCount: 7,
    unlockRequirementText: "15 kun + 4 faollik sikli va 7 post",
    bgGradient: "from-rose-500/28 via-amber-400/20 to-sky-400/25",
    accentColor: "#fecdd3",
    secondaryColor: "#fcd34d",
    glyphVariant: 17,
  },
  {
    id: "av_18",
    name: "Orbita",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 18,
    minActiveCycles: 5,
    minPostsCount: 9,
    unlockRequirementText: "18 kun + 5 faollik sikli va 9 post",
    bgGradient: "from-indigo-500/30 via-blue-500/20 to-emerald-400/20",
    accentColor: "#a5b4fc",
    secondaryColor: "#6ee7b7",
    glyphVariant: 18,
  },
  {
    id: "av_19",
    name: "Shisha Qirra",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 24,
    minActiveCycles: 6,
    minPostsCount: 12,
    unlockRequirementText: "24 kun + 6 faollik sikli va 12 post",
    bgGradient: "from-slate-300/25 via-sky-300/20 to-indigo-400/25",
    accentColor: "#f8fafc",
    secondaryColor: "#7dd3fc",
    glyphVariant: 19,
  },
  {
    id: "av_20",
    name: "Tutilish",
    category: "abstract",
    starterUnlocked: false,
    minAccountDays: 30,
    minActiveCycles: 8,
    minPostsCount: 15,
    unlockRequirementText: "30 kun + 8 faollik sikli va 15 post",
    bgGradient: "from-amber-500/25 via-rose-500/20 to-slate-900/60",
    accentColor: "#fde68a",
    secondaryColor: "#fb7185",
    glyphVariant: 20,
  },

  // --- 10 Minimal ---
  {
    id: "av_21",
    name: "Monolit",
    category: "minimal",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-slate-500/25 via-slate-700/25 to-slate-900/40",
    accentColor: "#e2e8f0",
    secondaryColor: "#94a3b8",
    glyphVariant: 21,
  },
  {
    id: "av_22",
    name: "Ufq Chizig‘i",
    category: "minimal",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-sky-500/22 via-slate-500/20 to-indigo-500/22",
    accentColor: "#bae6fd",
    secondaryColor: "#cbd5e1",
    glyphVariant: 22,
  },
  {
    id: "av_23",
    name: "Hilol",
    category: "minimal",
    starterUnlocked: true,
    minAccountDays: 0,
    minActiveCycles: 0,
    minPostsCount: 0,
    unlockRequirementText: "Boshidan ochiq",
    bgGradient: "from-indigo-500/28 via-slate-800/35 to-sky-500/20",
    accentColor: "#e0e7ff",
    secondaryColor: "#7dd3fc",
    glyphVariant: 23,
  },
  {
    id: "av_24",
    name: "Juft Halqa",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 3,
    minActiveCycles: 1,
    minPostsCount: 1,
    unlockRequirementText: "3 kun + 1 ta 3 kunlik faollik sikli",
    bgGradient: "from-teal-500/25 via-slate-600/20 to-cyan-500/20",
    accentColor: "#99f6e4",
    secondaryColor: "#67e8f9",
    glyphVariant: 24,
  },
  {
    id: "av_25",
    name: "Nuqtalar To‘ri",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 6,
    minActiveCycles: 2,
    minPostsCount: 3,
    unlockRequirementText: "6 kun + 2 faollik sikli va 3 post",
    bgGradient: "from-slate-400/25 via-sky-400/18 to-slate-700/30",
    accentColor: "#f1f5f9",
    secondaryColor: "#7dd3fc",
    glyphVariant: 25,
  },
  {
    id: "av_26",
    name: "Delta",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 10,
    minActiveCycles: 3,
    minPostsCount: 5,
    unlockRequirementText: "10 kun + 3 faollik sikli va 5 post",
    bgGradient: "from-sky-500/25 via-indigo-500/20 to-slate-800/35",
    accentColor: "#7dd3fc",
    secondaryColor: "#c7d2fe",
    glyphVariant: 26,
  },
  {
    id: "av_27",
    name: "Cheksizlik",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 14,
    minActiveCycles: 4,
    minPostsCount: 7,
    unlockRequirementText: "14 kun + 4 faollik sikli va 7 post",
    bgGradient: "from-violet-500/25 via-indigo-500/20 to-sky-500/20",
    accentColor: "#ddd6fe",
    secondaryColor: "#93c5fd",
    glyphVariant: 27,
  },
  {
    id: "av_28",
    name: "Zenit",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 18,
    minActiveCycles: 5,
    minPostsCount: 10,
    unlockRequirementText: "18 kun + 5 faollik sikli va 10 post",
    bgGradient: "from-emerald-400/25 via-teal-500/18 to-slate-800/30",
    accentColor: "#a7f3d0",
    secondaryColor: "#5eead4",
    glyphVariant: 28,
  },
  {
    id: "av_29",
    name: "Puls",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 24,
    minActiveCycles: 6,
    minPostsCount: 12,
    unlockRequirementText: "24 kun + 6 faollik sikli va 12 post",
    bgGradient: "from-rose-400/25 via-pink-500/18 to-slate-800/30",
    accentColor: "#fecdd3",
    secondaryColor: "#fda4af",
    glyphVariant: 29,
  },
  {
    id: "av_30",
    name: "Shimol Kompassi",
    category: "minimal",
    starterUnlocked: false,
    minAccountDays: 30,
    minActiveCycles: 8,
    minPostsCount: 15,
    unlockRequirementText: "30 kun + 8 faollik sikli va 15 post",
    bgGradient: "from-sky-400/30 via-amber-300/18 to-indigo-500/28",
    accentColor: "#f8fafc",
    secondaryColor: "#fde047",
    glyphVariant: 30,
  },
];

/**
 * Daily Active Unlock Progression:
 * Day 1 (active day #1) -> av_01 unlocked.
 * Each subsequent distinct active day unlocks exactly +1 avatar (av_02 .. av_30).
 */
export const AVATAR_CATALOG: AvatarCatalogItem[] = RAW_AVATAR_CATALOG.map(
  (item, idx) => {
    const dayNum = idx + 1;
    return {
      ...item,
      starterUnlocked: dayNum === 1,
      minActiveDays: dayNum,
      minAccountDays: idx,
      minActiveCycles: 0,
      minPostsCount: 0,
      unlockRequirementText:
        dayNum === 1
          ? "1-faol kun (boshidan ochiq)"
          : `${dayNum}-faol kunda ochiladi`,
    };
  }
);

export const STARTER_AVATAR_IDS = AVATAR_CATALOG.filter(
  (a) => a.starterUnlocked
).map((a) => a.id);

export function getAvatarById(avatarId?: string | null): AvatarCatalogItem {
  return (
    AVATAR_CATALOG.find((a) => a.id === avatarId) ?? AVATAR_CATALOG[0]!
  );
}

export function isValidAvatarId(avatarId: string): boolean {
  return AVATAR_CATALOG.some((a) => a.id === avatarId);
}

/**
 * Computes which avatars are unlocked: strictly 1 new avatar per distinct active day
 * (Day 1 => av_01, Day 2 => av_01..av_02, ..., Day 30 => all 30).
 * Previously unlocked avatars are never revoked.
 */
export function computeUnlockedAvatarIds(params: {
  previouslyUnlocked: string[];
  activeDaysCount?: number;
  accountAgeDays: number;
  activeThreeDayCycles: number;
  postsCount: number;
}): string[] {
  const effectiveActiveDays = Math.min(
    AVATAR_CATALOG.length,
    Math.max(1, params.activeDaysCount ?? params.accountAgeDays + 1)
  );

  const unlocked = new Set<string>([
    ...STARTER_AVATAR_IDS,
    ...params.previouslyUnlocked.filter(isValidAvatarId),
  ]);

  for (let i = 0; i < effectiveActiveDays; i++) {
    const item = AVATAR_CATALOG[i];
    if (item) {
      unlocked.add(item.id);
    }
  }

  return AVATAR_CATALOG.map((a) => a.id).filter((id) => unlocked.has(id));
}
