/**
 * Notebook Navigator Integration
 *
 * This module provides compatibility with the Notebook Navigator plugin:
 * - Uses the official Notebook Navigator API (v1.2.0+) for context menu items
 * - Uses MutationObserver for file icon decorations (since no API exists for that yet)
 *
 * The menu API provides a clean, reliable way to add lock/unlock menu items
 * without DOM hacking.
 */

import { setIcon } from "obsidian";
import type CurrentViewSettingsPlugin from "../main";
import type { ViewLockMode } from "../lib/rules";
import { resolveLockModeForPath } from "../lib/rules";
import { setLock, removeLock, LockTarget } from "./context-menu";
import type { NotebookNavigatorAPI, MenuExtensionDispose } from "../types/notebook-navigator";

const VIEW_LOCKS: ViewLockMode[] = ["reading", "source", "live"];

let fileListObserver: MutationObserver | null = null;
let fileMenuDispose: MenuExtensionDispose | null = null;
let folderMenuDispose: MenuExtensionDispose | null = null;
let decorateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Get the Notebook Navigator API if available
 */
const getNotebookNavigatorAPI = (plugin: CurrentViewSettingsPlugin): NotebookNavigatorAPI | null => {
  // @ts-ignore - accessing plugin registry
  const api = plugin.app.plugins?.plugins?.['notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
  return api ?? null;
};

/**
 * Initialize Notebook Navigator integration
 */
export const initNotebookNavigatorIntegration = (plugin: CurrentViewSettingsPlugin) => {
  // Try to register immediately
  tryRegisterMenus(plugin);
  
  // Also try again after a delay, in case Notebook Navigator loads after us
  setTimeout(() => {
    if (!fileMenuDispose && !folderMenuDispose) {
      tryRegisterMenus(plugin);
    }
  }, 1000);

  // Watch for file list changes to add icons
  setupFileListObserver(plugin);
};

/**
 * Try to register menu items with Notebook Navigator
 */
const tryRegisterMenus = (plugin: CurrentViewSettingsPlugin) => {
  const api = getNotebookNavigatorAPI(plugin);
  
  if (api?.menus) {
    // Register menu items using the official API
    fileMenuDispose = api.menus.registerFileMenu(({ addItem, file, selection }) => {
      if (selection.mode !== 'single') {
        return; // Only show menu for single file selection
      }
      
      addLockMenuItemsToNotebookNavigator(addItem, file.path, "file", plugin);
    });

    folderMenuDispose = api.menus.registerFolderMenu(({ addItem, folder }) => {
      addLockMenuItemsToNotebookNavigator(addItem, folder.path, "folder", plugin);
    });
  }
};

/**
 * Cleanup observers and listeners
 */
export const destroyNotebookNavigatorIntegration = () => {
  // Dispose menu registrations
  fileMenuDispose?.();
  fileMenuDispose = null;
  folderMenuDispose?.();
  folderMenuDispose = null;

  // Cleanup file list observer and pending debounce
  if (decorateDebounceTimer) {
    clearTimeout(decorateDebounceTimer);
    decorateDebounceTimer = null;
  }
  fileListObserver?.disconnect();
  fileListObserver = null;
  
  clearNotebookNavigatorDecorations();
};

/**
 * Add lock/unlock menu items using Notebook Navigator's menu API
 */
const addLockMenuItemsToNotebookNavigator = (
  addItem: (cb: (item: import("obsidian").MenuItem) => void) => void,
  path: string,
  type: LockTarget,
  plugin: CurrentViewSettingsPlugin
) => {
  const existing = resolveLockModeForPath(plugin.app, plugin.settings, path);

  // Add lock options for modes that aren't already set
  VIEW_LOCKS.filter((mode) => !existing || !existing.includes(mode)).forEach((mode) => {
    addItem((item) => {
      item
        .setTitle(`Lock ${mode.charAt(0).toUpperCase() + mode.slice(1)}`)
        .setIcon("lock")
        .onClick(async () => {
          await setLock(plugin, type, path, mode);
          decorateNotebookNavigator(plugin);
        });
    });
  });

  // Add unlock option if currently locked
  if (existing) {
    addItem((item) => {
      item
        .setTitle("Unlock")
        .setIcon("unlock")
        .onClick(async () => {
          await removeLock(plugin, type, path);
          decorateNotebookNavigator(plugin);
        });
    });
  }
};

/**
 * Extract file/folder path from a Notebook Navigator element
 * (Still needed for icon decorations)
 */
const extractPathFromElement = (el: HTMLElement): string | null => {
  // Try data-path attribute on element itself (most common for .nn-file)
  let dataPath = el.getAttribute("data-path");
  if (dataPath) {
    return dataPath;
  }

  // Try to find data-path in ANY child element
  const childWithPath = el.querySelector("[data-path]");
  if (childWithPath) {
    dataPath = childWithPath.getAttribute("data-path");
    if (dataPath) {
      return dataPath;
    }
  }

  // Try aria-label as fallback
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }

  return null;
};

/**
 * Resolve a path (which might be just a filename) to a full vault path
 * (Still needed for icon decorations)
 */
const resolvePathInVault = (
  plugin: CurrentViewSettingsPlugin,
  path: string,
  type: LockTarget
): string | null => {
  // If it's already a valid path, return it
  const abstractFile = plugin.app.vault.getAbstractFileByPath(path);
  if (abstractFile) {
    return abstractFile.path;
  }

  // Try to find file by name
  if (type === "file") {
    const files = plugin.app.vault.getFiles();
    const match = files.find(
      (f) => f.basename === path || f.name === path || f.path === path
    );
    if (match) return match.path;
  }

  // For folders, try common patterns
  if (type === "folder") {
    const folders = plugin.app.vault.getAllFolders();
    const match = folders.find((f) => f.name === path || f.path === path);
    if (match) return match.path;
  }

  return null;
};

/**
 * Watch for Notebook Navigator file list changes to add lock icons
 */
const setupFileListObserver = (plugin: CurrentViewSettingsPlugin) => {
  fileListObserver = new MutationObserver(() => {
    if (decorateDebounceTimer) clearTimeout(decorateDebounceTimer);
    decorateDebounceTimer = setTimeout(() => {
      decorateDebounceTimer = null;
      decorateNotebookNavigator(plugin);
    }, 150);
  });

  // Observe the entire document for nn-file elements
  fileListObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial decoration
  decorateNotebookNavigator(plugin);
};

/**
 * Add lock icons to Notebook Navigator file and folder items
 */
export const decorateNotebookNavigator = (plugin: CurrentViewSettingsPlugin) => {
  if (!plugin.settings.showExplorerIcons) {
    clearNotebookNavigatorDecorations();
    return;
  }

  // Build lookup maps once per decoration pass (avoid O(N×M) vault queries)
  const allFiles = plugin.app.vault.getFiles();
  const filePathByName = new Map<string, string>();
  for (const f of allFiles) {
    filePathByName.set(f.path, f.path);
    filePathByName.set(f.name, f.path);
    filePathByName.set(f.basename, f.path);
  }

  const allFolders = plugin.app.vault.getAllFolders();
  const folderPathByName = new Map<string, string>();
  for (const f of allFolders) {
    folderPathByName.set(f.path, f.path);
    folderPathByName.set(f.name, f.path);
  }

  // Decorate files in the file list
  const fileItems = document.querySelectorAll(".nn-file");

  fileItems.forEach((fileEl) => {
    const path = extractPathFromElement(fileEl as HTMLElement);
    if (!path) return;

    const resolvedPath = filePathByName.get(path) ?? null;
    if (!resolvedPath) return;

    const mode = resolveLockModeForPath(plugin.app, plugin.settings, resolvedPath);

    // Look for .nn-file-name (where we'll add the icon)
    const titleEl = fileEl.querySelector(".nn-file-name") as HTMLElement;
    if (!titleEl) return;

    // Always call addLockBadge - it will remove the badge if mode is null
    addLockBadge(titleEl, mode);
  });

  // Decorate folders in the navigation pane
  const folderItems = document.querySelectorAll(".nn-folder");

  folderItems.forEach((folderEl) => {
    const path = extractPathFromElement(folderEl as HTMLElement);
    if (!path) return;

    const resolvedPath = folderPathByName.get(path) ?? null;
    if (!resolvedPath) return;

    const mode = resolveLockModeForPath(plugin.app, plugin.settings, resolvedPath);

    // Look for .nn-navitem-name (where we'll add the icon)
    const titleEl = folderEl.querySelector(".nn-navitem-name") as HTMLElement;
    if (!titleEl) return;

    // Always call addLockBadge - it will remove the badge if mode is null
    addLockBadge(titleEl, mode);
  });
};

/**
 * Add or update lock badge on a title element
 */
const addLockBadge = (titleEl: HTMLElement, mode: string | null) => {
  const existing = titleEl.querySelector(".current-view-lock-nn") as HTMLElement | null;

  if (mode) {
    const badge: HTMLElement = existing || document.createElement("span");
    badge.className = "current-view-lock-nn";
    badge.setAttribute("aria-label", `Locked ${mode}`);
    badge.style.marginLeft = "4px";
    badge.style.opacity = "0.7";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.width = "12px";
    badge.style.height = "12px";
    badge.style.verticalAlign = "middle";
    badge.style.color = "var(--text-muted)";
    badge.style.flexShrink = "0";
    badge.innerHTML = "";
    setIcon(badge, renderModeIcon(mode));
    if (!existing) {
      titleEl.appendChild(badge);
    }
  } else if (existing) {
    existing.remove();
  }
};

/**
 * Get the appropriate icon for a lock mode
 */
const renderModeIcon = (mode: string): string => {
  if (mode.includes("reading")) return "book-open";
  if (mode.includes("live")) return "pen-tool";
  if (mode.includes("source")) return "code";
  return "lock";
};

/**
 * Remove all Notebook Navigator lock decorations
 */
export const clearNotebookNavigatorDecorations = () => {
  document.querySelectorAll(".current-view-lock-nn").forEach((el) => el.remove());
};
