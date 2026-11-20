type HapticImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type HapticNotificationType = "error" | "success" | "warning";

interface TelegramHapticFeedback {
  impactOccurred?: (style: HapticImpactStyle) => void;
  notificationOccurred?: (type: HapticNotificationType) => void;
  selectionChanged?: () => void;
}

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: {
      HapticFeedback?: TelegramHapticFeedback;
    };
  };
}

function getTelegramHaptics(): TelegramHapticFeedback | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as TelegramWindow).Telegram?.WebApp?.HapticFeedback ?? null;
}

export function triggerHapticImpact(
  style: HapticImpactStyle = "light"
): void {
  try {
    getTelegramHaptics()?.impactOccurred?.(style);
  } catch {
    // Ignore unsupported Telegram WebApp client versions
  }
}

export function triggerHapticSelection(): void {
  try {
    getTelegramHaptics()?.selectionChanged?.();
  } catch {
    // Ignore unsupported Telegram WebApp client versions
  }
}

export function triggerHapticNotification(
  type: HapticNotificationType
): void {
  try {
    getTelegramHaptics()?.notificationOccurred?.(type);
  } catch {
    // Ignore unsupported Telegram WebApp client versions
  }
}
