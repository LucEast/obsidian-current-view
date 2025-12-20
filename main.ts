import {
  WorkspaceLeaf,
  Plugin,
  MarkdownView,
  App,
  TFile,
  TFolder,
  PluginSettingTab,
  Setting,
  debounce,
  ViewState,
  Menu,
  Notice,
  setIcon,
} from "obsidian";
import { resolveViewModeDecision, normalizeFrontmatterMode } from "./view-mode";

// Interface for plugin settings
interface CurrentViewSettings {
  debounceTimeout: number; // Time in milliseconds to wait before applying the view mode
  customFrontmatterKey: string; // user-defined frontmatter key to control the view mode
  ignoreAlreadyOpen: boolean; // If true, the plugin will not change the view mode of already opened notes
  ignoreForceViewAll: boolean; // If true, the plugin will not change the view mode of notes opened from another one in a certain view mode
  folderRules: Array<{ path: string; mode: string }>; // Folder rules with assigned view modes
  explicitFileRules: Array<{ path: string; mode: string }>; // Explicit per-file rules
  filePatterns: Array<{ pattern: string; mode: string }>; // File patterns with assigned view modes
  showExplorerIcons: boolean; // Whether to show lock icons in the file explorer
  showLockNotifications: boolean; // Whether to show notices when locking/unlocking
}

// defaults for plugin settings
const DEFAULT_SETTINGS: CurrentViewSettings = {
  debounceTimeout: 300,
  customFrontmatterKey: "current view",
  ignoreAlreadyOpen: false,
  ignoreForceViewAll: false,
  folderRules: [{path: "", mode: ""}],
  explicitFileRules: [],
  filePatterns: [{pattern: "", mode: ""}],
  showExplorerIcons: true,
  showLockNotifications: true,
};

// main plugin class
export default class CurrentViewSettingsPlugin extends Plugin {
  settings: CurrentViewSettings; 
  openedFiles: String[]; // List of opened files

  // gets called when the plugin is loaded
  async onload() {
    // load settings
    await this.loadSettings();
    // migrate any folder locks incorrectly stored as file rules
    await migrateFolderRules(this);

    // Add the settings tab to the Obsidian settings UI
    this.addSettingTab(new CurrentViewSettingsTab(this.app, this));

    // Initialize the list of currently opened files
    this.openedFiles = resetOpenedNotes(this.app);

    type MarkdownViewState = {
      mode: "preview" | "source";
      source: boolean;
    };

    // Main function: reads the desired view mode from frontmatter or rules and applies it
    const readViewModeFromFrontmatterAndToggle = async (leaf: WorkspaceLeaf) => {
      // Check if the current leaf is a Markdown view
      let view = leaf.view instanceof MarkdownView ? leaf.view : null;

      if (null === view) {
        // If not a Markdown view and "ignoreAlreadyOpen" is enabled, reset opened files
        if (true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      // If the file is already open and "ignoreAlreadyOpen" is enabled, do nothing
      if (
        true == this.settings.ignoreAlreadyOpen &&
        view.file !== null &&
        alreadyOpen(view.file, this.openedFiles)
      ) {
        this.openedFiles = resetOpenedNotes(this.app);
        return;
      }

      // Get the current view state
      let state = leaf.getViewState();

      // Collect matched rule modes to resolve priority (folder, then file patterns, then explicit files)
      const matchedRuleModes: string[] = [];

      // Check if the file is in a configured folder and set mode if so (deepest folders win)
      const matchedFolders = this.settings.folderRules
        .filter((folderMode) => folderMode.path !== "" && folderMode.mode)
        .filter((folderMode) =>
          view.file ? isPathWithin(normalizePath(view.file.path), normalizePath(folderMode.path)) : false
        )
        .sort((a, b) => a.path.length - b.path.length);

      for (const { mode } of matchedFolders) {
        matchedRuleModes.push(mode);
      }

      // Check if the file matches a configured pattern and set mode if so
      for (const { pattern, mode } of this.settings.filePatterns) {
        if (!pattern || !mode) continue;
        if (!view.file || !view.file.basename.match(pattern)) continue;
        matchedRuleModes.push(mode);
      }

      // Check explicit per-file rules (highest priority)
      for (const fileRule of this.settings.explicitFileRules) {
        if (!fileRule.path || !fileRule.mode) continue;
        if (view.file && view.file.path === fileRule.path) {
          matchedRuleModes.push(fileRule.mode);
        }
      }

      const rawState = leaf.getViewState();
      const typedState = rawState as ViewState & { state: MarkdownViewState };
      if (!typedState.state) {
        typedState.state = {
          mode: view.getMode() === "preview" ? "preview" : "source",
          source: view.getMode() !== "preview",
        };
      }

      // Read frontmatter value for the custom key
      const fileCache = view.file ? this.app.metadataCache.getFileCache(view.file) : null;
      const fmValue =
        fileCache !== null && fileCache.frontmatter
          ? fileCache.frontmatter[this.settings.customFrontmatterKey]
          : null;

      const { mode: resolvedMode, source } = resolveViewModeDecision({
        matchedRuleModes,
        frontmatterValue: fmValue,
        customFrontmatterKey: this.settings.customFrontmatterKey,
      });

      if (resolvedMode) {
        await applyViewMode(typedState, resolvedMode, view, leaf);
        if (source === "frontmatter" && true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      // Fallback: apply the default view mode from Obsidian settings
      // @ts-ignore
      const defaultViewMode = this.app.vault.getConfig("defaultViewMode")
        // @ts-ignore
        ? this.app.vault.getConfig("defaultViewMode")
        : "source";
      // @ts-ignore
      const defaultEditingModeIsLivePreview =
        // @ts-ignore
        this.app.vault.getConfig("livePreview") === undefined
          ? true
          // @ts-ignore
          : this.app.vault.getConfig("livePreview");

      if (!this.settings.ignoreForceViewAll) {
        let state = leaf.getViewState();

        if (state.state) {
          if (view.getMode() !== defaultViewMode) {
            state.state.mode = defaultViewMode;
          }

          state.state.source = defaultEditingModeIsLivePreview ? false : true;
        }

        await leaf.setViewState(state);

        this.openedFiles = resetOpenedNotes(this.app);
      }
    };



    // Helper function: applies the view mode to the note
    const applyViewMode = async (
      viewState: ViewState & { state: MarkdownViewState },
      value: string,
      view: MarkdownView,
      leaf: WorkspaceLeaf
    ) => {
      if (value === "reading") {
        viewState.state.mode = "preview";
        viewState.state.source = false;
      } else if (value === "source") {
        viewState.state.mode = "source";
        viewState.state.source = true;
      } else if (value === "live") {
        viewState.state.mode = "source";
        viewState.state.source = false;
      }
      await leaf.setViewState(viewState);
    };

    // Register event: apply view mode when the active leaf changes
    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        this.settings.debounceTimeout === 0
          ? readViewModeFromFrontmatterAndToggle
          : debounce(
              readViewModeFromFrontmatterAndToggle,
              this.settings.debounceTimeout
          )
      )
    );

    // Context menu for files
    this.registerEvent(
      this.app.workspace.on("file-menu" as any, (menu: Menu, file: TFile | TFolder) => {
        const target: LockTarget = file instanceof TFolder ? "folder" : "file";
        addLockMenuItems(menu, file.path, target, this);
      })
    );

    // Context menu for folders
    this.registerEvent(
      this.app.workspace.on("folder-menu" as any, (menu: Menu, folder: TFolder) => {
        addLockMenuItems(menu, folder.path, "folder", this);
      })
    );

    const refreshDecorations = () => decorateFileExplorer(this);
    this.registerEvent(this.app.workspace.on("layout-change", refreshDecorations));
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        const newPath = file.path;
        let changed = false;
        this.settings.folderRules = this.settings.folderRules.map((r) => {
          if (r.path === oldPath) {
            changed = true;
            return { ...r, path: newPath };
          }
          return r;
        });
        this.settings.explicitFileRules = this.settings.explicitFileRules.map((r) => {
          if (r.path === oldPath) {
            changed = true;
            return { ...r, path: newPath };
          }
          return r;
        });
        if (changed) {
          await this.saveSettings();
          refreshDecorations();
        }
      })
    );

    refreshDecorations();
  }

  // Load plugin settings from disk or use defaults
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  // Save plugin settings to disk
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Called when the plugin is unloaded (e.g., disabled or removed)
  async onunload() {
    clearDecorations();
    resetViewsToDefault(this);
    this.openedFiles = [];
  }
}

// Check if a file is already open in the workspace
function alreadyOpen(currFile: TFile, openedFiles: String[]): boolean {
  const leavesWithSameNote: String[] = [];
  if (currFile == null) return false;
  openedFiles.forEach((openedFile: String) => {
    if (openedFile == currFile.basename) leavesWithSameNote.push(openedFile);
  });
  return leavesWithSameNote.length != 0;
}

// Get a list of all currently opened file basenames in the workspace
function resetOpenedNotes(app: App): String[] {
  let openedFiles: String[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    let view = leaf.view instanceof MarkdownView ? leaf.view : null;
    if (null === view) return;
    if (leaf.view instanceof MarkdownView) {
      if (leaf.view.file?.basename !== undefined) {
        openedFiles.push(leaf.view.file.basename);
      }
    }
  });
  return openedFiles;
}

type LockTarget = "file" | "folder";
type ViewLockMode = "reading" | "source" | "live";

const VIEW_LOCKS: ViewLockMode[] = ["reading", "source", "live"];

const addLockMenuItems = (
  menu: Menu,
  path: string,
  target: LockTarget,
  plugin: CurrentViewSettingsPlugin
) => {
  const existing = resolveLockModeForPath(plugin, path);
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

const setLock = async (
  plugin: CurrentViewSettingsPlugin,
  target: LockTarget,
  path: string,
  mode: ViewLockMode
) => {
  const normalizedPath = normalizePath(path);
  const modeValue = `${plugin.settings.customFrontmatterKey}: ${mode}`;
  if (target === "file") {
    plugin.settings.explicitFileRules = [
      ...plugin.settings.explicitFileRules.filter((r) => normalizePath(r.path) !== normalizedPath),
      { path: normalizedPath, mode: modeValue },
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

const removeLock = async (
  plugin: CurrentViewSettingsPlugin,
  target: LockTarget,
  path: string
) => {
  const normalizedPath = normalizePath(path);
  if (target === "file") {
    plugin.settings.explicitFileRules = plugin.settings.explicitFileRules.filter(
      (r) => normalizePath(r.path) !== normalizedPath
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

const decorateFileExplorer = (plugin: CurrentViewSettingsPlugin) => {
  const leaves = plugin.app.workspace.getLeavesOfType("file-explorer");
  leaves.forEach((leaf) => {
    const view: any = leaf.view;
    const items: Record<string, any> | undefined = view?.fileItems;
    if (!items) return;

    Object.entries(items).forEach(([path, item]) => {
      const targetEl = getTitleElement(item);
      if (!targetEl) return;
      const existing = targetEl.querySelector(".current-view-lock") as HTMLElement | null;
      const mode = resolveLockModeForPath(plugin, path);

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

const normalizePath = (path: string): string => {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();
};

const isPathWithin = (path: string, maybeParent: string): boolean => {
  const child = normalizePath(path);
  const parent = normalizePath(maybeParent);
  if (!parent) return false;
  if (child === parent) return true;
  const parentWithSlash = `${parent}/`;
  return child.startsWith(parentWithSlash);
};

const clearDecorations = () => {
  document.querySelectorAll(".current-view-lock").forEach((el) => el.remove());
};

const resetViewsToDefault = (plugin: CurrentViewSettingsPlugin) => {
  const leaves = plugin.app.workspace.getLeavesOfType("markdown");
  leaves.forEach((leaf) => {
    const view = leaf.view instanceof MarkdownView ? (leaf.view as MarkdownView) : null;
    if (!view) return;
    const state = leaf.getViewState();
    if (!state.state) return;
    // @ts-ignore
    const defaultViewMode = plugin.app.vault.getConfig("defaultViewMode")
      // @ts-ignore
      ? plugin.app.vault.getConfig("defaultViewMode")
      : "source";
    // @ts-ignore
    const defaultEditingModeIsLivePreview =
      // @ts-ignore
      plugin.app.vault.getConfig("livePreview") === undefined
        ? true
        // @ts-ignore
        : plugin.app.vault.getConfig("livePreview");
    state.state.mode = defaultViewMode;
    state.state.source = defaultEditingModeIsLivePreview ? false : true;
    leaf.setViewState(state);
  });
};

const resolveLockModeForPath = (
  plugin: CurrentViewSettingsPlugin,
  path: string
): string | null => {
  const normalizedPath = normalizePath(path);
  const fileRule = plugin.settings.explicitFileRules.find(
    (r) => normalizePath(r.path) === normalizedPath && r.mode
  );
  if (fileRule) return fileRule.mode;

  const folderRule = plugin.settings.folderRules
    .filter((r) => r.path && r.mode && isPathWithin(normalizedPath, r.path))
    .sort((a, b) => a.path.length - b.path.length)
    .pop();
  if (folderRule) return folderRule.mode;

  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    const cache = plugin.app.metadataCache.getFileCache(file);
    const fmValue = cache?.frontmatter?.[plugin.settings.customFrontmatterKey];
    const normalized = normalizeFrontmatterMode(fmValue);
    if (normalized) return `${plugin.settings.customFrontmatterKey}: ${normalized}`;
  }

  return null;
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

// Move any folder-like entries accidentally stored as explicit file rules into folder rules
const migrateFolderRules = async (plugin: CurrentViewSettingsPlugin) => {
  let changed = false;
  const remainingFileRules: Array<{ path: string; mode: string }> = [];

  plugin.settings.explicitFileRules.forEach((rule) => {
    const normalizedPath = normalizePath(rule.path);
    const looksLikeFolder = !normalizedPath.includes(".");
    const existsAsFolder =
      plugin.app.vault.getAbstractFileByPath(rule.path) instanceof TFolder ||
      plugin.app.vault.getAbstractFileByPath(normalizedPath) instanceof TFolder;

    if ((looksLikeFolder || existsAsFolder) && rule.mode) {
      const alreadyExists = plugin.settings.folderRules.some(
        (r) => normalizePath(r.path) === normalizedPath
      );
      if (!alreadyExists) {
        plugin.settings.folderRules.push({ path: normalizedPath, mode: rule.mode });
      }
      changed = true;
    } else {
      remainingFileRules.push(rule);
    }
  });

  if (changed) {
    plugin.settings.explicitFileRules = remainingFileRules;
    await plugin.saveSettings();
  }
};

// Settings tab class for the plugin
class CurrentViewSettingsTab extends PluginSettingTab {
  plugin: CurrentViewSettingsPlugin

  constructor(app: App, plugin: CurrentViewSettingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Render the settings UI
  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    new Setting(this.containerEl)
      .setDesc(createFragment((f) => {
        f.appendText("You can control the view mode of a note using frontmatter or rules.Possible values are 'reading' (Preview), 'source' (Source Mode), or 'live' (Live Preview). You can also set a custom frontmatter key to control the view mode, which is currently set to:");
      }));

    // Setting: custom frontmatter key
    new Setting(containerEl)
      .setName("Frontmatter key for view mode")
      .setDesc("Custom frontmatter key used to define the view mode. Default is 'current view'.")
      .addText((text) => {
        text
          .setPlaceholder("current view")
          .setValue(this.plugin.settings.customFrontmatterKey)
          .onChange(async (value) => {
            this.plugin.settings.customFrontmatterKey = value;
            await this.plugin.saveSettings();
          });
      });

    // Setting: ignore already opened files
    new Setting(containerEl)
      .setName("Ignore opened files")
      .setDesc("Never change the view mode on a note which was already open.")
      .addToggle((checkbox) =>
        checkbox
          .setValue(this.plugin.settings.ignoreAlreadyOpen)
          .onChange(async (value) => {
            this.plugin.settings.ignoreAlreadyOpen = value;
            await this.plugin.saveSettings();
          })
      );

    // Setting: ignore force view when not in frontmatter
    new Setting(containerEl)
      .setName("Ignore force view when not in frontmatter")
      .setDesc(
        "Never change the view mode on a note that was opened from another one in a certain view mode"
      )
      .addToggle((checkbox) => {
        checkbox
          .setValue(this.plugin.settings.ignoreForceViewAll)
          .onChange(async (value) => {
            this.plugin.settings.ignoreForceViewAll = value;
            await this.plugin.saveSettings();
          });
      });

    // Setting: debounce timeout
    new Setting(containerEl)
      .setName("Debounce timeout in milliseconds")
      .setDesc(
        `Debounce timeout is the time in milliseconds after which the view mode is set. Set "0" to disable debouncing (default value is "300"). If you experience issues with the plugin, try increasing this value.`
      )
      .addText((cb) => {
        cb.setValue(String(this.plugin.settings.debounceTimeout)).onChange(
          async (value) => {
            this.plugin.settings.debounceTimeout = Number(value);
            await this.plugin.saveSettings();
          }
        );
      });

    // Dropdown options for folder/file rules
    const modes = [
      "default",
      `${this.plugin.settings.customFrontmatterKey}: reading`,
      `${this.plugin.settings.customFrontmatterKey}: source`,
      `${this.plugin.settings.customFrontmatterKey}: live`,
    ];

    // Heading for folder rules
    new Setting(containerEl).setName('Folders').setHeading();

    new Setting(this.containerEl)
      .setDesc(createFragment((f) => {
        f.appendText("Specify a view mode for notes in a given folder.");
        f.createEl("br");
        f.appendText("Note that this will force the view mode on all the notes in the folder, even if they have a different view mode set in their frontmatter.");
        f.createEl("br");
        f.appendText("Precedence is from bottom (highest) to top (lowest), so if you have child folders specified, make sure to put them below their parent folder.");
      }));

    // Button to add a new folder rule
    new Setting(this.containerEl)
      .setDesc("Add new folder")
      .addButton((button) => {
        button
          .setTooltip("Add another folder to the list")
          .setButtonText("+")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.folderRules.push({
              path: "",
              mode: "",
            });
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Render each folder rule
    this.plugin.settings.folderRules.forEach((folderMode, index) => {
      const div = containerEl.createEl("div");
      div.addClass("force-view-mode-div");
      div.addClass("force-view-mode-folder");

      const s = new Setting(this.containerEl)
        .addSearch((cb) => {
          cb.setPlaceholder("Example: folder1/templates")
            .setValue(folderMode.path)
            .onChange(async (newFolder) => {
              if (
                newFolder &&
                this.plugin.settings.folderRules.some((e) => e.path == newFolder)
              ) {
                console.error(
                  "ForceViewMode: This folder already has a template associated with",
                  newFolder
                );
                return;
              }
              this.plugin.settings.folderRules[index].path = newFolder;
              await this.plugin.saveSettings();
            });
        })
        .addDropdown((cb) => {
          modes.forEach((mode) => {
            cb.addOption(mode, mode);
          });
          cb.setValue(folderMode.mode || "default").onChange(async (value) => {
            this.plugin.settings.folderRules[index].mode = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((cb) => {
          cb.setIcon("cross")
            .setTooltip("Delete")
            .onClick(async () => {
              this.plugin.settings.folderRules.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      s.infoEl.remove();
      div.appendChild(containerEl.lastChild as Node);
    });

    // Heading for file pattern rules
    new Setting(containerEl).setName('Files').setHeading();

    new Setting(this.containerEl)
      .setDesc(createFragment((f) => {
        f.appendText("Specify a view mode for notes with specific patterns (regular expression; example \" - All$\" for all notes ending with \" - All\" or \"1900-01\" for all daily notes starting with \"1900-01\"");
        f.createEl("br");
        f.appendText("Note that this will force the view mode, even if it have a different view mode set in its frontmatter.");
        f.createEl("br");
        f.appendText("Precedence is from bottom (highest) to top (lowest).");
        f.createEl("br");
        f.appendText("Notice that configuring a file pattern will override the folder configuration for the same file.");
      }));

    // Button to add a new file pattern rule
    new Setting(this.containerEl)
      .setDesc("Add new file")
      .addButton((button) => {
        button
          .setTooltip("Add another file to the list")
          .setButtonText("+")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.filePatterns.push({
              pattern: "",
              mode: "",
            });
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Render each file pattern rule
    this.plugin.settings.filePatterns.forEach((file, index) => {
      const div = containerEl.createEl("div");
      div.addClass("force-view-mode-div");
      div.addClass("force-view-mode-folder");

      const s = new Setting(this.containerEl)
        .addSearch((cb) => {
          cb.setPlaceholder(`Example: " - All$" or "1900-01")`)
            .setValue(file.pattern)
            .onChange(async (value) => {
              if (
                value &&
                this.plugin.settings.filePatterns.some((e) => e.pattern == value)
              ) {
                console.error("ForceViewMode: Pattern already exists", value);
                return;
              }
              this.plugin.settings.filePatterns[index].pattern = value;
              await this.plugin.saveSettings();
            });
        })
        .addDropdown((cb) => {
          modes.forEach((mode) => {
            cb.addOption(mode, mode);
          });
          cb.setValue(file.mode || "default").onChange(async (value) => {
            this.plugin.settings.filePatterns[index].mode = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((cb) => {
          cb.setIcon("cross")
            .setTooltip("Delete")
            .onClick(async () => {
              this.plugin.settings.filePatterns.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      s.infoEl.remove();
      div.appendChild(containerEl.lastChild as Node);
    });

    // Heading for explicit file locks
    new Setting(containerEl).setName('Locked files').setHeading();
    new Setting(containerEl)
      .setName("Show lock icons in explorer")
      .setDesc("Toggle inline icons for locked files/folders in the file explorer.")
      .addToggle((cb) => {
        cb.setValue(this.plugin.settings.showExplorerIcons).onChange(async (value) => {
          this.plugin.settings.showExplorerIcons = value;
          await this.plugin.saveSettings();
          decorateFileExplorer(this.plugin);
        });
      });

    new Setting(containerEl)
      .setName("Show lock notifications")
      .setDesc("Show a short notice when locking or unlocking.")
      .addToggle((cb) => {
        cb.setValue(this.plugin.settings.showLockNotifications).onChange(async (value) => {
          this.plugin.settings.showLockNotifications = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setDesc("Files locked via context menu. Remove entries to unlock.")
      .addButton((button) => {
        button
          .setTooltip("Add file path manually")
          .setButtonText("+")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.explicitFileRules.push({ path: "", mode: "" });
            await this.plugin.saveSettings();
            this.display();
          });
      });

    this.plugin.settings.explicitFileRules.forEach((rule, index) => {
      const s = new Setting(this.containerEl)
        .addText((cb) => {
          cb.setPlaceholder("folder/file.md")
            .setValue(rule.path)
            .onChange(async (value) => {
              this.plugin.settings.explicitFileRules[index].path = value;
              await this.plugin.saveSettings();
            });
        })
        .addDropdown((cb) => {
          const modes = [
            "default",
            `${this.plugin.settings.customFrontmatterKey}: reading`,
            `${this.plugin.settings.customFrontmatterKey}: source`,
            `${this.plugin.settings.customFrontmatterKey}: live`,
          ];
          modes.forEach((mode) => cb.addOption(mode, mode));
          cb.setValue(rule.mode || "default").onChange(async (value) => {
            this.plugin.settings.explicitFileRules[index].mode = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((cb) => {
          cb.setIcon("cross")
            .setTooltip("Delete")
            .onClick(async () => {
              this.plugin.settings.explicitFileRules.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      s.infoEl.remove();
    });
  }
}
