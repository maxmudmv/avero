export interface LightPhysicsState {
  pointerX: number; // Normalized [-1, 1]
  pointerY: number; // Normalized [-1, 1]
  gyroBeta: number; // Degrees [-180, 180]
  gyroGamma: number; // Degrees [-90, 90]
  hasGyro: boolean;
  scrollY: number;
  scrollVelocity: number;
  timeSeconds: number;
}

export interface ComputedLightAngles {
  angle: number;
  angleAlt: number;
}

export function normalizeDegrees(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function lerpAngle(current: number, target: number, alpha: number): number {
  const diff = ((((target - current) % 360) + 540) % 360) - 180;
  return normalizeDegrees(current + diff * alpha);
}

/**
 * Computes `--lg-angle` and `--lg-angle-alt` using multi-wave harmonic
 * breathing sway combined with gyroscope, scroll refraction, and pointer
 * vector inputs (never a simple linear spinning gradient).
 */
export function computeLiquidLightAngles(
  state: LightPhysicsState
): ComputedLightAngles {
  const t = state.timeSeconds;

  // Non-integer harmonic ratios create organic, non-repeating breathing sway
  const breathingPrimary =
    14 * Math.sin(t * 0.47) +
    7.5 * Math.sin(t * 1.13 + 0.85) +
    4.0 * Math.cos(t * 0.23);

  const breathingAlt =
    18 * Math.cos(t * 0.39 + 1.2) +
    9.0 * Math.sin(t * 0.89 + 0.4) -
    5.0 * Math.sin(t * 0.19);

  // Pointer vector contribution (fallback & desktop precision)
  const pointerAngleOffset =
    Math.atan2(state.pointerY, state.pointerX) * (180 / Math.PI) * 0.16;

  // Gyroscope contribution when available on mobile/tablet
  const gyroOffset = state.hasGyro
    ? state.gyroGamma * 0.65 + (state.gyroBeta - 45) * 0.32
    : 0;

  // Scroll refraction (bounded trigonometric modulation + velocity impulse)
  const scrollRefraction =
    12 * Math.sin(state.scrollY * 0.0045) +
    Math.max(-18, Math.min(18, state.scrollVelocity * 0.35));

  const basePrimary = 132;
  const baseAlt = 224;

  const angle = normalizeDegrees(
    basePrimary +
      breathingPrimary +
      pointerAngleOffset +
      gyroOffset +
      scrollRefraction
  );

  const angleAlt = normalizeDegrees(
    baseAlt +
      breathingAlt -
      pointerAngleOffset * 0.85 +
      gyroOffset * 0.7 -
      scrollRefraction * 0.6
  );

  return { angle, angleAlt };
}

export interface DeviceCapabilityProfile {
  isMobileViewport: boolean;
  isLowPower: boolean;
  targetFps: number;
}

export function detectDeviceCapabilities(): DeviceCapabilityProfile {
  if (typeof window === "undefined") {
    return { isMobileViewport: false, isLowPower: false, targetFps: 60 };
  }

  const isCoarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const isNarrow = window.innerWidth < 768;
  const isMobileViewport = isCoarsePointer || isNarrow;

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const isLowPower =
    cores <= 2 || (typeof memory === "number" && memory <= 2);

  const targetFps = isLowPower ? 30 : isMobileViewport ? 45 : 60;

  return { isMobileViewport, isLowPower, targetFps };
}

type GyroPermissionState = "granted" | "denied" | "prompt" | "unsupported";

interface DeviceOrientationWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export class LiquidGlassPhysicsEngine {
  private rafId: number | null = null;
  private running = false;
  private reducedMotion = false;
  private lastFrameMs = 0;
  private startMs = 0;
  private currentAngle = 132;
  private currentAngleAlt = 224;
  private capabilities: DeviceCapabilityProfile = {
    isMobileViewport: false,
    isLowPower: false,
    targetFps: 60,
  };

  private state: LightPhysicsState = {
    pointerX: 0.25,
    pointerY: -0.25,
    gyroBeta: 45,
    gyroGamma: 0,
    hasGyro: false,
    scrollY: 0,
    scrollVelocity: 0,
    timeSeconds: 0,
  };

  private lastScrollY = 0;
  private listeners: Set<(angles: ComputedLightAngles) => void> = new Set();

  constructor(private readonly targetElement?: HTMLElement) {}

  public subscribe(fn: (angles: ComputedLightAngles) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public getCurrentAngles(): ComputedLightAngles {
    return { angle: this.currentAngle, angleAlt: this.currentAngleAlt };
  }

  public getHasGyro(): boolean {
    return this.state.hasGyro;
  }

  public async requestGyroPermission(): Promise<GyroPermissionState> {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      return "unsupported";
    }
    const ctor =
      window.DeviceOrientationEvent as unknown as DeviceOrientationWithPermission;
    if (typeof ctor.requestPermission === "function") {
      try {
        const result = await ctor.requestPermission();
        return result === "granted" ? "granted" : "denied";
      } catch {
        return "denied";
      }
    }
    return "granted";
  }

  public start(): () => void {
    if (typeof window === "undefined" || this.running) {
      return () => {};
    }

    this.running = true;
    this.startMs = performance.now();
    this.lastFrameMs = this.startMs;
    this.capabilities = detectDeviceCapabilities();

    const root = this.targetElement ?? document.documentElement;
    root.dataset.perfTier = this.capabilities.isLowPower
      ? "eco"
      : this.capabilities.isMobileViewport
        ? "mobile"
        : "desktop";

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = mql.matches;

    if (this.reducedMotion) {
      this.applyAngles(132, 224, 0);
    }

    const onMotionChange = (e: MediaQueryListEvent) => {
      this.reducedMotion = e.matches;
      if (this.reducedMotion) {
        this.stopRaf();
        this.applyAngles(132, 224, 0);
      } else if (!document.hidden) {
        this.scheduleRaf();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.reducedMotion) return;
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.state.pointerX = (e.clientX / w) * 2 - 1;
      this.state.pointerY = (e.clientY / h) * 2 - 1;
    };

    const onScroll = () => {
      if (this.reducedMotion) return;
      const y = window.scrollY;
      this.state.scrollVelocity = y - this.lastScrollY;
      this.state.scrollY = y;
      this.lastScrollY = y;
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (this.reducedMotion) return;
      if (typeof e.gamma === "number" && typeof e.beta === "number") {
        this.state.hasGyro = true;
        this.state.gyroGamma = Math.max(-90, Math.min(90, e.gamma));
        this.state.gyroBeta = Math.max(-180, Math.min(180, e.beta));
      }
    };

    const onResize = () => {
      this.capabilities = detectDeviceCapabilities();
      root.dataset.perfTier = this.capabilities.isLowPower
        ? "eco"
        : this.capabilities.isMobileViewport
          ? "mobile"
          : "desktop";
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        this.stopRaf();
      } else if (!this.reducedMotion) {
        this.lastFrameMs = performance.now();
        this.scheduleRaf();
      }
    };

    mql.addEventListener("change", onMotionChange);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("deviceorientation", onDeviceOrientation, {
      passive: true,
    });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!this.reducedMotion && !document.hidden) {
      this.scheduleRaf();
    }

    return () => {
      this.running = false;
      this.stopRaf();
      mql.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }

  private scheduleRaf(): void {
    if (this.rafId !== null || !this.running) return;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (nowMs: number): void => {
    this.rafId = null;
    if (!this.running || this.reducedMotion) return;

    const minFrameDelta = 1000 / this.capabilities.targetFps;
    if (nowMs - this.lastFrameMs >= minFrameDelta) {
      this.lastFrameMs = nowMs;
      this.state.timeSeconds = (nowMs - this.startMs) / 1000;
      this.state.scrollVelocity *= 0.86;

      const target = computeLiquidLightAngles(this.state);
      this.currentAngle = lerpAngle(this.currentAngle, target.angle, 0.14);
      this.currentAngleAlt = lerpAngle(
        this.currentAngleAlt,
        target.angleAlt,
        0.12
      );

      this.applyAngles(
        this.currentAngle,
        this.currentAngleAlt,
        this.state.timeSeconds
      );
    }

    this.scheduleRaf();
  };

  private applyAngles(angle: number, angleAlt: number, t = 0): void {
    const root = this.targetElement ?? document.documentElement;
    root.style.setProperty("--lg-angle", `${angle.toFixed(2)}deg`);
    root.style.setProperty("--lg-angle-alt", `${angleAlt.toFixed(2)}deg`);

    // Organic multi-harmonic perimeter caustic pockets (non-spinning Lissajous drift + gyro/scroll bias)
    const tiltBiasX = this.state.hasGyro
      ? Math.max(-18, Math.min(18, this.state.gyroGamma * 0.45))
      : this.state.pointerX * 14;
    const tiltBiasY = this.state.hasGyro
      ? Math.max(-18, Math.min(18, (this.state.gyroBeta - 45) * 0.35))
      : this.state.pointerY * 14;
    const scrollPhase = this.state.scrollY * 0.0022;

    // Spot 1: White + Electric Cyan caustic (sweeps corners & edges asymmetrically)
    const s1x =
      50 + 52 * Math.sin(t * 0.53 + scrollPhase) + 12 * Math.cos(t * 1.17) + tiltBiasX;
    const s1y =
      50 + 58 * Math.cos(t * 0.37 - 0.55) + 14 * Math.sin(t * 0.89) + tiltBiasY;

    // Spot 2: Iridescent Gold + Violet/Magenta caustic (independent counter-harmonic ratio)
    const s2x =
      50 + 54 * Math.cos(t * 0.41 + 1.85 - scrollPhase * 0.7) + 10 * Math.sin(t * 0.97) - tiltBiasX * 0.8;
    const s2y =
      50 + 56 * Math.sin(t * 0.67 + 0.42) + 12 * Math.cos(t * 0.29) - tiltBiasY * 0.8;

    // Spot 3: Secondary Silver + Turquoise micro-glint (slow figure-8 weave)
    const s3x =
      50 + 50 * Math.sin(t * 0.29 + 3.14) + 16 * Math.cos(t * 0.73 + 0.9);
    const s3y =
      50 + 54 * Math.cos(t * 0.61 + 1.15) - 10 * Math.sin(t * 0.43);

    // Subtle organic breathing intensity
    const pulse = 0.88 + 0.12 * Math.sin(t * 0.83) * Math.cos(t * 0.31);

    root.style.setProperty("--lg-spot1-x", `${s1x.toFixed(1)}%`);
    root.style.setProperty("--lg-spot1-y", `${s1y.toFixed(1)}%`);
    root.style.setProperty("--lg-spot2-x", `${s2x.toFixed(1)}%`);
    root.style.setProperty("--lg-spot2-y", `${s2y.toFixed(1)}%`);
    root.style.setProperty("--lg-spot3-x", `${s3x.toFixed(1)}%`);
    root.style.setProperty("--lg-spot3-y", `${s3y.toFixed(1)}%`);
    root.style.setProperty("--lg-pulse", pulse.toFixed(3));

    for (const listener of this.listeners) {
      listener({ angle, angleAlt });
    }
  }
}
