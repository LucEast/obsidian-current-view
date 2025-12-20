import { App, TFolder } from "obsidian";

export type PathRule = { path: string; mode: string };
export type PatternRule = { pattern: string; mode: string };

export interface CurrentViewSettings {
  debounceTimeout: number;
  customFrontmatterKey: string;
  ignoreAlreadyOpen: boolean;
  ignoreForceViewAll: boolean;
  folderRules: PathRule[];
  explicitFileRules: PathRule[]; // legacy; migrated into filePatterns
  filePatterns: PatternRule[];
  showExplorerIcons: boolean;
  showLockNotifications: boolean;
}

export const DEFAULT_SETTINGS: CurrentViewSettings = {
  debounceTimeout: 300,
  customFrontmatterKey: "current view",
  ignoreAlreadyOpen: false,
  ignoreForceViewAll: false,
  folderRules: [{ path: "", mode: "" }],
  explicitFileRules: [],
  filePatterns: [{ pattern: "", mode: "" }],
  showExplorerIcons: true,
  showLockNotifications: true,
};

export const normalizePath = (path: string): string => {
  const trimmed = path.trim();
  return trimmed
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
};

export const isPathWithin = (path: string, maybeParent: string): boolean => {
  const child = normalizePath(path);
  const parent = normalizePath(maybeParent);
  if (!parent) return false;
  if (child === parent) return true;
  const parentWithSlash = `${parent}/`;
  return child.startsWith(parentWithSlash);
};

// Move any folder-like entries accidentally stored as explicit file rules into folder rules
export const migrateFolderRules = async (
  app: App,
  settings: CurrentViewSettings,
  save: () => Promise<void>
) => {
  let changed = false;
  const remainingFileRules: Array<PathRule> = [];

  settings.explicitFileRules.forEach((rule) => {
    const normalizedPath = normalizePath(rule.path);
    const looksLikeFolder = !normalizedPath.includes(".");
    const existsAsFolder =
      app.vault.getAbstractFileByPath(rule.path) instanceof TFolder ||
      app.vault.getAbstractFileByPath(normalizedPath) instanceof TFolder;

    if ((looksLikeFolder || existsAsFolder) && rule.mode) {
      const alreadyExists = settings.folderRules.some(
        (r) => normalizePath(r.path) === normalizedPath
      );
      if (!alreadyExists) {
        settings.folderRules.push({ path: normalizedPath, mode: rule.mode });
      }
      changed = true;
    } else {
      remainingFileRules.push(rule);
    }
  });

  if (changed) {
    settings.explicitFileRules = remainingFileRules;
    await save();
  }
};

// Move explicitFileRules into filePatterns as exact matches
export const migrateFileLocks = async (
  settings: CurrentViewSettings,
  save: () => Promise<void>
) => {
  if (!settings.explicitFileRules.length) return;
  let changed = false;
  settings.explicitFileRules.forEach((rule) => {
    const normalizedPath = normalizePath(rule.path);
    const exists = settings.filePatterns.some(
      (p) => normalizePath(p.pattern) === normalizedPath
    );
    if (!exists) {
      settings.filePatterns.push({ pattern: normalizedPath, mode: rule.mode });
      changed = true;
    }
  });
  if (changed) {
    settings.explicitFileRules = [];
    await save();
  }
};
