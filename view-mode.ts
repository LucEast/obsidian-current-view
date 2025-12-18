export type ViewMode = "reading" | "source" | "live";

export type ModeSource = "rule" | "frontmatter";

const VALID_MODES: ViewMode[] = ["reading", "source", "live"];

const isValidMode = (value: string | null | undefined): value is ViewMode => {
  return !!value && (VALID_MODES as string[]).includes(value);
};

export const normalizeFrontmatterMode = (value: unknown): ViewMode | null => {
  if (typeof value !== "string") return null;
  return isValidMode(value.trim()) ? (value.trim() as ViewMode) : null;
};

export const parseRuleMode = (
  rawMode: string | null | undefined,
  customFrontmatterKey: string
): ViewMode | null => {
  if (!rawMode) return null;
  const [key, value] = rawMode.split(":").map((s) => s.trim());
  if (key === "default") return null;
  if (key !== customFrontmatterKey) return null;
  return isValidMode(value) ? (value as ViewMode) : null;
};

export const resolveViewModeDecision = ({
  matchedRuleModes,
  frontmatterValue,
  customFrontmatterKey,
}: {
  matchedRuleModes: Array<string>;
  frontmatterValue: unknown;
  customFrontmatterKey: string;
}): { mode: ViewMode | null; source: ModeSource | null } => {
  let resolvedMode: ViewMode | null = null;
  let source: ModeSource | null = null;

  for (const ruleMode of matchedRuleModes) {
    const parsed = parseRuleMode(ruleMode, customFrontmatterKey);
    if (parsed !== null) {
      resolvedMode = parsed;
      source = "rule";
      continue;
    }

    if (typeof ruleMode === "string" && ruleMode.trim().startsWith("default")) {
      resolvedMode = null;
      source = null;
    }
  }

  if (resolvedMode) {
    return { mode: resolvedMode, source };
  }

  const normalizedFrontmatter = normalizeFrontmatterMode(frontmatterValue);
  if (normalizedFrontmatter) {
    return { mode: normalizedFrontmatter, source: "frontmatter" };
  }

  return { mode: null, source: null };
};
