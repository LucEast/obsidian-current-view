import { getFileTags, collectMatchedRules } from "../src/lib/rules";
import { App, TFile } from "obsidian";
import type { CurrentViewSettings } from "../src/config/settings";

const key = "current view";

const makeSettings = (
  overrides: Partial<CurrentViewSettings> = {}
): CurrentViewSettings => ({
  debounceTimeout: 0,
  customFrontmatterKey: key,
  ignoreAlreadyOpen: false,
  ignoreForceViewAll: false,
  folderRules: [],
  explicitFileRules: [],
  filePatterns: [],
  tagRules: [],
  showExplorerIcons: false,
  showLockNotifications: false,
  ...overrides,
});

const makeApp = (tags: unknown): App => {
  const app = new App();
  app.metadataCache = {
    getFileCache: () => ({ frontmatter: { tags } }),
  };
  return app;
};

describe("getFileTags", () => {
  test("returns empty array when file is null", () => {
    const app = new App();
    expect(getFileTags(app, null)).toEqual([]);
  });

  test("returns empty array when no tags in frontmatter", () => {
    const app = new App();
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual([]);
  });

  test("handles tags as a string", () => {
    const app = makeApp("sent");
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual(["sent"]);
  });

  test("handles tags as an array", () => {
    const app = makeApp(["sent", "published"]);
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual(["sent", "published"]);
  });

  test("strips leading # from tags", () => {
    const app = makeApp(["#sent", "#Published"]);
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual(["sent", "published"]);
  });

  test("normalizes tags to lowercase", () => {
    const app = makeApp(["Sent", "PUBLISHED"]);
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual(["sent", "published"]);
  });

  test("ignores non-string tag entries", () => {
    const app = makeApp(["sent", 42, null]);
    const file = new TFile("note.md");
    expect(getFileTags(app, file)).toEqual(["sent"]);
  });
});

describe("collectMatchedRules – tag rules", () => {
  test("matches when file has the tag", () => {
    const app = makeApp(["sent"]);
    const file = new TFile("archive/note.md");
    const settings = makeSettings({
      tagRules: [{ tag: "sent", mode: `${key}: reading` }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    expect(result).toEqual([`${key}: reading`]);
  });

  test("does not match when file lacks the tag", () => {
    const app = makeApp(["draft"]);
    const file = new TFile("note.md");
    const settings = makeSettings({
      tagRules: [{ tag: "sent", mode: `${key}: reading` }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    expect(result).toEqual([]);
  });

  test("normalizes # prefix in rule tag", () => {
    const app = makeApp(["sent"]);
    const file = new TFile("note.md");
    const settings = makeSettings({
      tagRules: [{ tag: "#sent", mode: `${key}: reading` }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    expect(result).toEqual([`${key}: reading`]);
  });

  test("skips tag rules with empty tag or mode", () => {
    const app = makeApp(["sent"]);
    const file = new TFile("note.md");
    const settings = makeSettings({
      tagRules: [{ tag: "", mode: `${key}: reading` }, { tag: "sent", mode: "" }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    expect(result).toEqual([]);
  });

  test("tag rule priority: file patterns override tag rules", () => {
    const app = makeApp(["sent"]);
    const file = new TFile("note.md");
    const settings = makeSettings({
      tagRules: [{ tag: "sent", mode: `${key}: reading` }],
      filePatterns: [{ pattern: "note.md", mode: `${key}: source` }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    // file pattern is pushed last → last wins in resolveViewModeDecision
    expect(result).toEqual([`${key}: reading`, `${key}: source`]);
  });

  test("tag rules override folder rules", () => {
    const app = makeApp(["sent"]);
    const file = new TFile("docs/note.md");
    const settings = makeSettings({
      folderRules: [{ path: "docs", mode: `${key}: live` }],
      tagRules: [{ tag: "sent", mode: `${key}: reading` }],
    });

    const result = collectMatchedRules(app, settings, file, () => false);
    // folder rule first, tag rule second → tag rule wins
    expect(result).toEqual([`${key}: live`, `${key}: reading`]);
  });
});
