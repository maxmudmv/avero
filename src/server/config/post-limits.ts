import "server-only";

export interface PostLimitConfig {
  baseLimit: number;
  emailVerifiedBonus: number;
  referralBonusPerFriend: number;
  maxReferralBonus: number;
  absoluteMaxLimit: number;
}

/**
 * Configurable post character limit rules.
 * Base limit is 1000 characters; verified referrals and account milestones
 * can unlock additional characters, and unlocked limits never decrease.
 */
export const POST_LIMIT_CONFIG: PostLimitConfig = {
  baseLimit: 1000,
  emailVerifiedBonus: 200,
  referralBonusPerFriend: 250,
  maxReferralBonus: 2000,
  absoluteMaxLimit: 3500,
};

export interface PostLimitBreakdown {
  currentMaxLength: number;
  baseLimit: number;
  verifiedReferralsCount: number;
  emailVerifiedBonus: number;
  referralBonus: number;
  nextMilestoneHint: string;
}

export function computeUnlockedPostLength(params: {
  currentMaxLength: number;
  verifiedReferralsCount: number;
  hasVerifiedEmail: boolean;
  config?: PostLimitConfig;
}): {
  unlockedMaxLength: number;
  emailVerifiedBonus: number;
  referralBonus: number;
} {
  const cfg = params.config ?? POST_LIMIT_CONFIG;

  const emailVerifiedBonus = params.hasVerifiedEmail
    ? cfg.emailVerifiedBonus
    : 0;
  const referralBonus = Math.min(
    cfg.maxReferralBonus,
    Math.max(0, params.verifiedReferralsCount) * cfg.referralBonusPerFriend
  );

  const computed = Math.min(
    cfg.absoluteMaxLimit,
    cfg.baseLimit + emailVerifiedBonus + referralBonus
  );

  // Monotonic guarantee: an unlocked user limit NEVER decreases
  const unlockedMaxLength = Math.max(
    cfg.baseLimit,
    params.currentMaxLength,
    computed
  );

  return {
    unlockedMaxLength,
    emailVerifiedBonus,
    referralBonus,
  };
}
