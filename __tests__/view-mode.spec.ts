import { resolveViewModeDecision } from "../view-mode";

const key = "current view";

describe("resolveViewModeDecision", () => {
  test("prefers last matching rule, giving file patterns higher priority than folders", () => {
    const result = resolveViewModeDecision({
      matchedRuleModes: [`${key}: reading`, `${key}: live`],
      frontmatterValue: null,
      customFrontmatterKey: key,
    });

    expect(result).toEqual({ mode: "live", source: "rule" });
  });

  test("falls back to frontmatter when no rule applies", () => {
    const result = resolveViewModeDecision({
      matchedRuleModes: [],
      frontmatterValue: "source",
      customFrontmatterKey: key,
    });

    expect(result).toEqual({ mode: "source", source: "frontmatter" });
  });

  test("default rule clears previous matches and defers to frontmatter", () => {
    const result = resolveViewModeDecision({
      matchedRuleModes: [`${key}: reading`, "default"],
      frontmatterValue: "live",
      customFrontmatterKey: key,
    });

    expect(result).toEqual({ mode: "live", source: "frontmatter" });
  });

  test("returns null when no valid source is available", () => {
    const result = resolveViewModeDecision({
      matchedRuleModes: ["invalidkey: live"],
      frontmatterValue: 42,
      customFrontmatterKey: key,
    });

    expect(result).toEqual({ mode: null, source: null });
  });
});
