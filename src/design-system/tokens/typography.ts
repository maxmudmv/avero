export const TYPOGRAPHY_TOKENS = {
  fontSans:
    '"Inter Variable", "Inter", "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif',
  fontDisplay:
    '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Inter Variable", system-ui, sans-serif',
  fontMono:
    '"JetBrains Mono Variable", "JetBrains Mono", "SF Mono", ui-monospace, monospace',
  scale: {
    display: { size: "1.875rem", lineHeight: "1.2", tracking: "-0.025em" },
    heading: { size: "1.375rem", lineHeight: "1.3", tracking: "-0.02em" },
    title: { size: "1.0625rem", lineHeight: "1.4", tracking: "-0.012em" },
    postBody: { size: "0.96875rem", lineHeight: "1.6", tracking: "-0.005em" },
    body: { size: "0.9375rem", lineHeight: "1.55", tracking: "0em" },
    caption: { size: "0.8125rem", lineHeight: "1.4", tracking: "0.005em" },
    micro: { size: "0.6875rem", lineHeight: "1.3", tracking: "0.025em" },
  },
} as const;
