import { describe, expect, it } from "vitest";
import {
  computeLiquidLightAngles,
  lerpAngle,
  normalizeDegrees,
} from "@/design-system/physics/light-physics";
import { DESIGN_COLORS } from "@/design-system/tokens/colors";
import {
  LIQUID_BUTTON_SPRING,
  LIQUID_BUTTON_TAP,
} from "@/design-system/tokens/motion";
import { Z_INDEX } from "@/design-system/tokens/z-index";

describe("OLED Matte + Apple Liquid Glass Design System", () => {
  it("defines exact required color, spring, tap, and z-index tokens", () => {
    expect(DESIGN_COLORS.dark.bg).toBe("#060709");
    expect(DESIGN_COLORS.dark.matteCard).toBe("rgba(18, 20, 26, 0.94)");
    expect(DESIGN_COLORS.dark.border).toBe("rgba(255, 255, 255, 0.075)");
    expect(DESIGN_COLORS.light.bg).toBe("#f2f4f8");

    expect(LIQUID_BUTTON_TAP).toEqual({ scaleX: 1.055, scaleY: 0.91 });
    expect(LIQUID_BUTTON_SPRING).toMatchObject({
      type: "spring",
      stiffness: 460,
      damping: 17,
    });

    expect(Z_INDEX.modal).toBe(70);
    expect(Z_INDEX.select).toBe(90);
  });

  it("computes multi-wave breathing light angles with gyro, scroll, and pointer fallback", () => {
    const base = computeLiquidLightAngles({
      pointerX: 0,
      pointerY: 0,
      gyroBeta: 45,
      gyroGamma: 0,
      hasGyro: false,
      scrollY: 0,
      scrollVelocity: 0,
      timeSeconds: 0,
    });

    const later = computeLiquidLightAngles({
      pointerX: 0.7,
      pointerY: -0.4,
      gyroBeta: 60,
      gyroGamma: 20,
      hasGyro: true,
      scrollY: 320,
      scrollVelocity: 12,
      timeSeconds: 3.7,
    });

    expect(base.angle).toBeGreaterThanOrEqual(0);
    expect(base.angle).toBeLessThan(360);
    expect(later.angle).not.toBe(base.angle);
    expect(later.angleAlt).not.toBe(base.angleAlt);
  });

  it("normalizes and interpolates circular angles across 0/360 boundary", () => {
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(375)).toBe(15);

    const lerped = lerpAngle(355, 5, 0.5);
    expect(lerped).toBeCloseTo(0, 5);
  });
});
