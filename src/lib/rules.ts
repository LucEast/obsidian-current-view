import { normalizeFrontmatterMode } from "../../view-mode";
import type { CurrentViewSettings } from "../config/settings";
import { normalizePath, isPathWithin } from "../config/settings";
import { TFile, App } from "obsidian";

export type ViewLockMode = "reading" | "source" | "live";

export const collectMatchedRules = (
  app: App,
  settings: CurrentViewSettings,
  file: TFile | null,
  filenameMatch: (pattern: string) => boolean
): string[] => {
  const matchedRuleModes: string[] = [];

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
  const fileRule = settings.filePatterns.find(
    (r) => normalizePath(r.pattern) === normalizedPath && r.mode
  );
  if (fileRule) return fileRule.mode;

  const folderRule = settings.folderRules
    .filter((r) => r.path && r.mode && isPathWithin(normalizedPath, r.path))
    .sort((a, b) => a.path.length - b.path.length)
    .pop();
  if (folderRule) return folderRule.mode;

  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    const fmMode = resolveFrontmatterMode(app, file, settings.customFrontmatterKey);
    if (fmMode) return fmMode;
  }

  return null;
};
