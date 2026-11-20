export const POST_TYPES = [
  { id: "note", label: "Oddiy matn", shortLabel: "Matn" },
  { id: "poem", label: "She’r", shortLabel: "She’r" },
  { id: "quote", label: "Iqtibos", shortLabel: "Iqtibos" },
  { id: "thought", label: "Shaxsiy fikr", shortLabel: "Fikr" },
  { id: "story", label: "Qisqa hikoya", shortLabel: "Hikoya" },
] as const;

export type PostTypeId = (typeof POST_TYPES)[number]["id"];

export const POST_FONT_OPTIONS = [
  { id: "sans", label: "Inter (Zamonaviy)" },
  { id: "display", label: "Plus Jakarta (Sarlavha)" },
  { id: "serif", label: "Adabiy Serif" },
  { id: "mono", label: "JetBrains Mono" },
] as const;

export const POST_COLOR_OPTIONS = [
  { id: "default", label: "Asosiy", swatchClass: "bg-[var(--text-primary)]" },
  { id: "pearl", label: "Marvarid Oq", swatchClass: "bg-slate-100" },
  { id: "sky", label: "Moviy Nur", swatchClass: "bg-sky-300" },
  { id: "mint", label: "Zumrad", swatchClass: "bg-teal-300" },
  { id: "amber", label: "Oltin", swatchClass: "bg-amber-300" },
  { id: "rose", label: "Atirgul", swatchClass: "bg-rose-300" },
] as const;

export const POST_BG_OPTIONS = [
  { id: "matte", label: "OLED Matte" },
  { id: "aurora", label: "Aurora Glass" },
  { id: "midnight", label: "Tungi Ko‘k" },
  { id: "sunset", label: "Shafaq" },
  { id: "emerald", label: "Zumrad Soyasi" },
  { id: "pearl", label: "Marvarid Yuzasi" },
] as const;

export interface PostStyleTokens {
  editorMode?: "simple" | "advanced";
  templateId?: string;
  fontFamily?: "sans" | "display" | "serif" | "mono";
  textColor?: "default" | "pearl" | "sky" | "mint" | "amber" | "rose";
  bgStyle?: "matte" | "aurora" | "midnight" | "sunset" | "emerald" | "pearl";
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: "left" | "center" | "right";
}

export interface PostTemplatePreset {
  id: string;
  name: string;
  postType: PostTypeId;
  style: PostStyleTokens;
}

export const POST_DESIGN_TEMPLATES: PostTemplatePreset[] = [
  {
    id: "classic",
    name: "Klassik Matn",
    postType: "note",
    style: {
      editorMode: "advanced",
      templateId: "classic",
      fontFamily: "sans",
      textColor: "default",
      bgStyle: "matte",
      isBold: false,
      isItalic: false,
      textAlign: "left",
    },
  },
  {
    id: "poetic_center",
    name: "She’riy Oqshom",
    postType: "poem",
    style: {
      editorMode: "advanced",
      templateId: "poetic_center",
      fontFamily: "serif",
      textColor: "pearl",
      bgStyle: "aurora",
      isBold: false,
      isItalic: true,
      textAlign: "center",
    },
  },
  {
    id: "quote_editorial",
    name: "Iqtibos Kartasi",
    postType: "quote",
    style: {
      editorMode: "advanced",
      templateId: "quote_editorial",
      fontFamily: "display",
      textColor: "sky",
      bgStyle: "midnight",
      isBold: true,
      isItalic: false,
      textAlign: "center",
    },
  },
  {
    id: "emerald_thought",
    name: "Zumrad Fikr",
    postType: "thought",
    style: {
      editorMode: "advanced",
      templateId: "emerald_thought",
      fontFamily: "sans",
      textColor: "mint",
      bgStyle: "emerald",
      isBold: false,
      isItalic: false,
      textAlign: "left",
    },
  },
  {
    id: "sunset_story",
    name: "Qisqa Hikoya",
    postType: "story",
    style: {
      editorMode: "advanced",
      templateId: "sunset_story",
      fontFamily: "serif",
      textColor: "amber",
      bgStyle: "sunset",
      isBold: false,
      isItalic: false,
      textAlign: "left",
    },
  },
  {
    id: "pearl_minimal",
    name: "Minimal Kod / Eslatma",
    postType: "note",
    style: {
      editorMode: "advanced",
      templateId: "pearl_minimal",
      fontFamily: "mono",
      textColor: "default",
      bgStyle: "pearl",
      isBold: false,
      isItalic: false,
      textAlign: "left",
    },
  },
];

const FONT_CLASS_MAP: Record<NonNullable<PostStyleTokens["fontFamily"]>, string> = {
  sans: "font-[family-name:var(--font-sans)]",
  display: "font-[family-name:var(--font-display)]",
  serif: "font-serif",
  mono: "font-[family-name:var(--font-mono)]",
};

const TEXT_COLOR_CLASS_MAP: Record<
  NonNullable<PostStyleTokens["textColor"]>,
  string
> = {
  default: "text-[var(--text-primary)]",
  pearl: "text-slate-900 dark:text-slate-100",
  sky: "text-sky-700 dark:text-sky-200",
  mint: "text-teal-700 dark:text-teal-200",
  amber: "text-amber-700 dark:text-amber-200",
  rose: "text-rose-700 dark:text-rose-200",
};

const BG_STYLE_CLASS_MAP: Record<
  NonNullable<PostStyleTokens["bgStyle"]>,
  string
> = {
  matte: "",
  aurora:
    "bg-gradient-to-br from-sky-500/10 via-indigo-500/8 to-teal-400/10",
  midnight:
    "bg-gradient-to-br from-slate-900/15 via-blue-900/15 to-indigo-950/20 dark:from-blue-950/55 dark:via-slate-950/85 dark:to-indigo-950/50",
  sunset:
    "bg-gradient-to-br from-amber-500/10 via-rose-500/8 to-violet-500/10",
  emerald:
    "bg-gradient-to-br from-emerald-500/10 via-teal-500/8 to-cyan-500/10",
  pearl:
    "bg-gradient-to-br from-white/50 via-slate-100/40 to-sky-100/25 dark:from-white/[0.04] dark:via-white/[0.02] dark:to-sky-400/[0.05]",
};

const ALIGN_CLASS_MAP: Record<
  NonNullable<PostStyleTokens["textAlign"]>,
  string
> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function getPostTypeLabel(postType: PostTypeId): string {
  return POST_TYPES.find((t) => t.id === postType)?.label ?? "Oddiy matn";
}

export function getPostStyleClasses(style?: PostStyleTokens | null): {
  containerClass: string;
  textClass: string;
} {
  if (!style || style.editorMode !== "advanced") {
    return {
      containerClass: "",
      textClass: "text-[var(--text-primary)] text-left",
    };
  }

  const font = FONT_CLASS_MAP[style.fontFamily ?? "sans"];
  const color = TEXT_COLOR_CLASS_MAP[style.textColor ?? "default"];
  const align = ALIGN_CLASS_MAP[style.textAlign ?? "left"];
  const bg = BG_STYLE_CLASS_MAP[style.bgStyle ?? "matte"];

  return {
    containerClass: bg
      ? `rounded-2xl border border-[var(--border-matte)] px-4 py-3.5 ${bg}`
      : "",
    textClass: [
      font,
      color,
      align,
      style.isBold ? "font-semibold" : "font-normal",
      style.isItalic ? "italic" : "not-italic",
    ].join(" "),
  };
}
