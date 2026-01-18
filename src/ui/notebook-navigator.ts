/**
 * Notebook Navigator Integration
 *
 * This module provides compatibility with the Notebook Navigator plugin
 * by using MutationObserver to inject lock menu items and file icons.
 *
 * Notebook Navigator doesn't fire standard Obsidian events (file-menu, folder-menu),
 * so we need to observe DOM changes and inject our UI elements.
 */

import { Menu, TFile, TFolder, setIcon } from "obsidian";
import type CurrentViewSettingsPlugin from "../main";
import type { ViewLockMode } from "../lib/rules";
import { resolveLockModeForPath } from "../lib/rules";
import { setLock, removeLock, LockTarget } from "./context-menu";

const VIEW_LOCKS: ViewLockMode[] = ["reading", "source", "live"];

let menuObserver: MutationObserver | null = null;
let fileListObserver: MutationObserver | null = null;
let lastContextMenuTarget: { path: string; type: LockTarget } | null = null;

/**
 * Initialize Notebook Navigator integration
 */
export const initNotebookNavigatorIntegration = (plugin: CurrentViewSettingsPlugin) => {
  // Watch for context menus appearing
  setupMenuObserver(plugin);

  // Watch for file list changes to add icons
  setupFileListObserver(plugin);

  // Capture right-click target on nn-file and nn-folder elements
  document.addEventListener("contextmenu", handleContextMenu, true);
};

/**
 * Cleanup observers and listeners
 */
export const destroyNotebookNavigatorIntegration = () => {
  menuObserver?.disconnect();
  menuObserver = null;
  fileListObserver?.disconnect();
  fileListObserver = null;
  document.removeEventListener("contextmenu", handleContextMenu, true);
  lastContextMenuTarget = null;
  clearNotebookNavigatorDecorations();
};

/**
 * Capture the file/folder path when right-clicking on Notebook Navigator elements
 */
const handleContextMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // Find the nearest nn-file or nn-folder element
  const fileEl = target.closest(".nn-file") as HTMLElement | null;
  const folderEl = target.closest("[class*='nn-folder']") as HTMLElement | null;

  if (fileEl) {
    // Extract path from data attribute or aria-label
    const path = extractPathFromElement(fileEl);
    if (path) {
      lastContextMenuTarget = { path, type: "file" };
    }
  } else if (folderEl) {
    const path = extractPathFromElement(folderEl);
    if (path) {
      lastContextMenuTarget = { path, type: "folder" };
    }
  } else {
    lastContextMenuTarget = null;
  }
};

/**
 * Extract file/folder path from a Notebook Navigator element
 */
const extractPathFromElement = (el: HTMLElement): string | null => {
  // Try data-path attribute
  const dataPath = el.getAttribute("data-path");
  if (dataPath) return dataPath;

  // Try to find path in child elements
  const titleEl = el.querySelector(".nn-file-title, .nn-folder-title");
  if (titleEl) {
    const path = titleEl.getAttribute("data-path");
    if (path) return path;
  }

  // Try aria-label which often contains the filename
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    // aria-label might be just the filename, not full path
    // We'll need to resolve this through the app
    return ariaLabel;
  }

  return null;
};

/**
 * Watch for Obsidian menu elements appearing and inject our items
 */
const setupMenuObserver = (plugin: CurrentViewSettingsPlugin) => {
  menuObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const addedNodes = Array.from(mutation.addedNodes);
      for (const node of addedNodes) {
        if (node instanceof HTMLElement && node.classList.contains("menu")) {
          // Check if this is likely a Notebook Navigator menu
          if (lastContextMenuTarget) {
            injectMenuItems(node, plugin, lastContextMenuTarget);
          }
        }
      }
    }
  });

  menuObserver.observe(document.body, {
    childList: true,
    subtree: false, // Menus are added directly to body
  });
};

/**
 * Inject lock/unlock menu items into a Notebook Navigator context menu
 */
const injectMenuItems = (
  menuEl: HTMLElement,
  plugin: CurrentViewSettingsPlugin,
  target: { path: string; type: LockTarget }
) => {
  // Resolve the actual file/folder path
  const resolvedPath = resolvePathInVault(plugin, target.path, target.type);
  if (!resolvedPath) return;

  const existing = resolveLockModeForPath(plugin.app, plugin.settings, resolvedPath);

  // Find the menu items container
  const menuContainer = menuEl.querySelector(".menu") || menuEl;

  // Add a separator before our items
  const separator = document.createElement("div");
  separator.className = "menu-separator";
  menuContainer.appendChild(separator);

  // Add lock options for modes that aren't already set
  VIEW_LOCKS.filter((mode) => !existing || !existing.includes(mode)).forEach((mode) => {
    const menuItem = createMenuItem(
      `Lock ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
      "lock",
      async () => {
        await setLock(plugin, target.type, resolvedPath, mode);
        decorateNotebookNavigator(plugin);
      }
    );
    menuContainer.appendChild(menuItem);
  });

  // Add unlock option if currently locked
  if (existing) {
    const unlockItem = createMenuItem("Unlock", "unlock", async () => {
      await removeLock(plugin, target.type, resolvedPath);
      decorateNotebookNavigator(plugin);
    });
    menuContainer.appendChild(unlockItem);
  }
};

/**
 * Create a menu item element matching Obsidian's style
 */
const createMenuItem = (
  title: string,
  icon: string,
  onClick: () => void
): HTMLElement => {
  const item = document.createElement("div");
  item.className = "menu-item";
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
    // Close the menu
    const menu = item.closest(".menu");
    if (menu) menu.remove();
  });

  const iconEl = document.createElement("div");
  iconEl.className = "menu-item-icon";
  setIcon(iconEl, icon);

  const titleEl = document.createElement("div");
  titleEl.className = "menu-item-title";
  titleEl.textContent = title;

  item.appendChild(iconEl);
  item.appendChild(titleEl);

  return item;
};

/**
 * Resolve a path (which might be just a filename) to a full vault path
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
    // Debounce decoration updates
    requestAnimationFrame(() => decorateNotebookNavigator(plugin));
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
 * Add lock icons to Notebook Navigator file items
 */
export const decorateNotebookNavigator = (plugin: CurrentViewSettingsPlugin) => {
  if (!plugin.settings.showExplorerIcons) {
    clearNotebookNavigatorDecorations();
    return;
  }

  // Find all nn-file elements
  const fileItems = document.querySelectorAll(".nn-file");

  fileItems.forEach((fileEl) => {
    const path = extractPathFromElement(fileEl as HTMLElement);
    if (!path) return;

    const resolvedPath = resolvePathInVault(plugin, path, "file");
    if (!resolvedPath) return;

    const mode = resolveLockModeForPath(plugin.app, plugin.settings, resolvedPath);
    const titleEl = fileEl.querySelector(".nn-file-title") as HTMLElement | null;
    if (!titleEl) return;

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
  });
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
