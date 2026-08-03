import { normalizeFrontmatterMode } from "./view-mode";
import type { CurrentViewSettings, PropertyRule } from "../config/settings";
import { normalizePath, isPathWithin } from "../config/settings";
import { TFile, App } from "obsidian";

export const getFileTags = (app: App, file: TFile | null): string[] => {
  const cache = file ? app.metadataCache.getFileCache(file) : null;
  const raw = cache?.frontmatter?.["tags"];
  if (!raw) return [];
  const tags = Array.isArray(raw) ? raw : [raw];
  return tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^#/, "").toLowerCase().trim());
};

export type ViewLockMode = "reading" | "source" | "live";

const propertyValueMatches = (fmValue: unknown, ruleValue: string): boolean => {
  const normalizedRuleValue = ruleValue.trim().toLowerCase();
  if (Array.isArray(fmValue)) {
    if (normalizedRuleValue === "") return fmValue.length > 0;
    return fmValue.some((element) => propertyValueMatches(element, ruleValue));
  }
  if (fmValue === null || fmValue === undefined) return false;
  const normalizedFmValue = String(fmValue).trim().toLowerCase();
  if (normalizedRuleValue === "") return normalizedFmValue !== "";
  return normalizedFmValue === normalizedRuleValue;
};

export const matchPropertyRules = (
  frontmatter: Record<string, unknown> | null | undefined,
  propertyRules: PropertyRule[]
): string[] => {
  if (!frontmatter) return [];
  const matched: string[] = [];
  for (const { key, value, mode } of propertyRules) {
    if (!key.trim() || !mode) continue;
    if (propertyValueMatches(frontmatter[key.trim()], value)) {
      matched.push(mode);
    }
  }
  return matched;
};

export const collectMatchedRules = (
  app: App,
  settings: CurrentViewSettings,
  file: TFile | null,
  filenameMatch: (pattern: string) => boolean
): string[] => {
  const matchedRuleModes: string[] = [];

  // Property rules (lowest priority — every later rule type overrides via last-wins)
  const fileCache = file ? app.metadataCache.getFileCache(file) : null;
  matchedRuleModes.push(
    ...matchPropertyRules(fileCache?.frontmatter, settings.propertyRules ?? [])
  );

  // Folder rules (deepest wins because later entries override earlier ones)
  const matchedFolders = settings.folderRules
    .filter((folderMode) => folderMode.path !== "" && folderMode.mode)
    .filter((folderMode) =>
      file ? isPathWithin(normalizePath(file.path), normalizePath(folderMode.path)) : false
    )
    .sort((a, b) => a.path.length - b.path.length);

  for (const { mode } of matchedFolders) {
    matchedRuleModes.push(mode);
  }

  // Tag rules
  const fileTags = getFileTags(app, file);
  for (const { tag, mode } of settings.tagRules) {
    if (!tag || !mode) continue;
    const normalizedTag = tag.replace(/^#/, "").toLowerCase().trim();
    if (fileTags.includes(normalizedTag)) {
      matchedRuleModes.push(mode);
    }
  }

  // File patterns (exact path or basename regex)
  for (const { pattern, mode } of settings.filePatterns) {
    if (!pattern || !mode) continue;
    if (!file) continue;
    const normalizedPattern = normalizePath(pattern);
    const normalizedFile = normalizePath(file.path);
    const directMatch = normalizedPattern === normalizedFile || filenameMatch(pattern);
    if (!directMatch) continue;
    matchedRuleModes.push(mode);
  }

  return matchedRuleModes;
};

export const resolveFrontmatterMode = (
  app: App,
  file: TFile | null,
  customKey: string
): string | null => {
  const cache = file ? app.metadataCache.getFileCache(file) : null;
  const fmValue = cache?.frontmatter?.[customKey];
  const normalized = normalizeFrontmatterMode(fmValue);
  return normalized ? `${customKey}: ${normalized}` : null;
};

export const resolveLockModeForPath = (
  app: App,
  settings: CurrentViewSettings,
  path: string
): string | null => {
  const normalizedPath = normalizePath(path);
  const file = app.vault.getAbstractFileByPath(path);

  if (file instanceof TFile) {
    const fmMode = resolveFrontmatterMode(app, file, settings.customFrontmatterKey);
    if (fmMode) return fmMode;
  }

  const fileRule = settings.filePatterns.find(
    (r) => normalizePath(r.pattern) === normalizedPath && r.mode
  );
  if (fileRule) return fileRule.mode;

  if (file instanceof TFile) {
    const fileTags = getFileTags(app, file);
    for (const { tag, mode } of settings.tagRules) {
      if (!tag || !mode) continue;
      const normalizedTag = tag.replace(/^#/, "").toLowerCase().trim();
      if (fileTags.includes(normalizedTag)) return mode;
    }
  }

  const folderRule = settings.folderRules
    .filter((r) => r.path && r.mode && isPathWithin(normalizedPath, r.path))
    .sort((a, b) => a.path.length - b.path.length)
    .pop();
  if (folderRule) return folderRule.mode;

  if (file instanceof TFile) {
    const fileCache = app.metadataCache.getFileCache(file);
    const propertyMatches = matchPropertyRules(
      fileCache?.frontmatter,
      settings.propertyRules ?? []
    );
    if (propertyMatches.length) return propertyMatches[propertyMatches.length - 1];
  }

  return null;
};
