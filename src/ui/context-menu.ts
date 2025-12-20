import { Menu, Notice, TFolder, TFile, setIcon } from "obsidian";
import type CurrentViewSettingsPlugin from "../main";
import type { ViewLockMode } from "../lib/rules";
import { normalizePath } from "../config/settings";
import { resolveLockModeForPath } from "../lib/rules";

export type LockTarget = "file" | "folder";

const VIEW_LOCKS: ViewLockMode[] = ["reading", "source", "live"];

export const addLockMenuItems = (
  menu: Menu,
  path: string,
  target: LockTarget,
  plugin: CurrentViewSettingsPlugin
) => {
  const existing = resolveLockModeForPath(plugin.app, plugin.settings, path);
  VIEW_LOCKS.filter((mode) => !existing || !existing.includes(mode)).forEach((mode) => {
    menu.addItem((item) => {
      item
        .setTitle(`Lock ${mode.charAt(0).toUpperCase() + mode.slice(1)}`)
        .setIcon("lock")
        .onClick(async () => {
          await setLock(plugin, target, path, mode);
        });
    });
  });

  if (existing) {
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Unlock")
        .setIcon("unlock")
        .onClick(async () => {
          await removeLock(plugin, target, path);
        })
    );
  }
};

export const setLock = async (
  plugin: CurrentViewSettingsPlugin,
  target: LockTarget,
  path: string,
  mode: ViewLockMode
) => {
  const normalizedPath = normalizePath(path);
  const modeValue = `${plugin.settings.customFrontmatterKey}: ${mode}`;
  if (target === "file") {
    plugin.settings.filePatterns = [
      ...plugin.settings.filePatterns.filter((r) => normalizePath(r.pattern) !== normalizedPath),
      { pattern: normalizedPath, mode: modeValue },
    ];
  } else {
    plugin.settings.folderRules = [
      ...plugin.settings.folderRules.filter((r) => normalizePath(r.path) !== normalizedPath),
      { path: normalizedPath, mode: modeValue },
    ];
  }
  await plugin.saveSettings();
  decorateFileExplorer(plugin);
  if (plugin.settings.showLockNotifications) {
    new Notice(`${target === "file" ? "File" : "Folder"} locked to ${mode}`);
  }
};

export const removeLock = async (
  plugin: CurrentViewSettingsPlugin,
  target: LockTarget,
  path: string
) => {
  const normalizedPath = normalizePath(path);
  if (target === "file") {
    plugin.settings.filePatterns = plugin.settings.filePatterns.filter(
      (r) => normalizePath(r.pattern) !== normalizedPath
    );
  } else {
    plugin.settings.folderRules = plugin.settings.folderRules.filter(
      (r) => normalizePath(r.path) !== normalizedPath
    );
  }
  await plugin.saveSettings();
  decorateFileExplorer(plugin);
  if (plugin.settings.showLockNotifications) {
    new Notice(`${target === "file" ? "File" : "Folder"} unlocked`);
  }
};

export const decorateFileExplorer = (plugin: CurrentViewSettingsPlugin) => {
  const leaves = plugin.app.workspace.getLeavesOfType("file-explorer");
  leaves.forEach((leaf) => {
    const view: any = leaf.view;
    const items: Record<string, any> | undefined = view?.fileItems;
    if (!items) return;

    Object.entries(items).forEach(([path, item]) => {
      const targetEl = getTitleElement(item);
      if (!targetEl) return;
      const existing = targetEl.querySelector(".current-view-lock") as HTMLElement | null;
      const mode = resolveLockModeForPath(plugin.app, plugin.settings, path);

      if (!plugin.settings.showExplorerIcons) {
        if (existing) existing.remove();
        return;
      }

      if (mode) {
        const badge: HTMLElement = existing || document.createElement("span");
        badge.className = "current-view-lock";
        badge.setAttribute("aria-label", `Locked ${mode}`);
        badge.style.marginLeft = "6px";
        badge.style.opacity = "0.8";
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.width = "14px";
        badge.style.height = "14px";
        badge.style.verticalAlign = "middle";
        badge.style.color = "var(--text-muted)";
        badge.innerHTML = "";
        setIcon(badge, renderModeIcon(mode));
        if (!existing) {
          targetEl.appendChild(badge);
        }
      } else if (existing) {
        existing.remove();
      }
    });
  });
};

const getTitleElement = (item: any): HTMLElement | null => {
  const candidates: Array<HTMLElement | null | undefined> = [
    item?.titleInnerEl as HTMLElement | undefined,
    item?.titleEl as HTMLElement | undefined,
    item?.selfEl?.querySelector?.(".nav-file-title-content") as HTMLElement | undefined,
    item?.selfEl?.querySelector?.(".nav-folder-title-content") as HTMLElement | undefined,
    item?.selfEl?.querySelector?.(".nav-file-title") as HTMLElement | undefined,
    item?.selfEl?.querySelector?.(".nav-folder-title") as HTMLElement | undefined,
  ];
  return candidates.find((el) => !!el) || null;
};

const renderModeBadge = (mode: string): string => {
  if (mode.includes("reading")) return "reading";
  if (mode.includes("live")) return "live";
  if (mode.includes("source")) return "source";
  return "unknown";
};

const renderModeIcon = (mode: string): string => {
  const normalized = renderModeBadge(mode);
  if (normalized === "reading") return "book-open";
  if (normalized === "live") return "pen-tool";
  if (normalized === "source") return "code";
  return "lock";
};

export const clearDecorations = () => {
  document.querySelectorAll(".current-view-lock").forEach((el) => el.remove());
};
