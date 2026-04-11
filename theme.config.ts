export const themeColors = {
  // ─── Backgrounds (mock: 3-tier dark gradient) ─────────────────────
  primary: { light: '#00D4AA', dark: '#00D4AA' },
  background: { light: '#0A0A0A', dark: '#0A0A0A' },        // main pane bg
  backgroundDeep: { light: '#0A0A0A', dark: '#0A0A0A' },     // deepest bg
  surface: { light: '#111111', dark: '#111111' },             // pane headers, cards
  surfaceHigh: { light: '#0D0D0D', dark: '#0D0D0D' },        // sidebar, agentbar, contextbar
  surface2: { light: '#1A1A1A', dark: '#1A1A1A' },           // elevated surfaces, modals

  // ─── Text ─────────────────────────────────────────────────────────
  foreground: { light: '#E5E7EB', dark: '#E5E7EB' },         // primary text
  foregroundDim: { light: '#D1D5DB', dark: '#D1D5DB' },       // secondary text
  muted: { light: '#6B7280', dark: '#6B7280' },               // labels, inactive text
  inactive: { light: '#4B5563', dark: '#4B5563' },            // disabled, placeholder
  hint: { light: '#3D4451', dark: '#3D4451' },                // very dim hints

  // ─── Borders ──────────────────────────────────────────────────────
  border: { light: '#1A1A1A', dark: '#1A1A1A' },              // standard borders
  borderLight: { light: '#1A1A1A', dark: '#1A1A1A' },         // subtle borders
  borderHeavy: { light: '#333333', dark: '#333333' },         // emphasized borders

  // ─── Semantic ─────────────────────────────────────────────────────
  success: { light: '#4ADE80', dark: '#4ADE80' },
  warning: { light: '#FBBF24', dark: '#FBBF24' },
  error: { light: '#EF4444', dark: '#EF4444' },               // mock uses #EF4444

  // ─── Accent ───────────────────────────────────────────────────────
  accent: { light: '#00D4AA', dark: '#00D4AA' },
  prompt: { light: '#00D4AA', dark: '#00D4AA' },
  command: { light: '#93C5FD', dark: '#93C5FD' },
  tint: { light: '#00D4AA', dark: '#00D4AA' },
  link: { light: '#60A5FA', dark: '#60A5FA' },

  // ─── AI / Interpret ───────────────────────────────────────────────
  aiPurple: { light: '#8B5CF6', dark: '#8B5CF6' },
  interpretPurple: { light: '#A78BFA', dark: '#A78BFA' },
  interpretText: { light: '#C4B5FD', dark: '#C4B5FD' },

  // ─── Misc ─────────────────────────────────────────────────────────
  keyLabel: { light: '#B0B8C1', dark: '#B0B8C1' },
  infoText: { light: '#9BA1A6', dark: '#9BA1A6' },
} as const;
