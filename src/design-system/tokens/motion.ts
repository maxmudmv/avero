export const LIQUID_BUTTON_SPRING = {
  type: "spring" as const,
  stiffness: 460,
  damping: 17,
};

export const LIQUID_BUTTON_TAP = {
  scaleX: 1.055,
  scaleY: 0.91,
} as const;

export const LIQUID_SHEET_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.85,
} as const;

export const LIQUID_MODAL_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 28,
} as const;

export const LIQUID_TAB_SPRING = {
  type: "spring" as const,
  stiffness: 480,
  damping: 30,
} as const;
