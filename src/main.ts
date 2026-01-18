import {
  WorkspaceLeaf,
  Plugin,
  MarkdownView,
  App,
  TFile,
  TFolder,
  Setting,
  debounce,
  ViewState,
  Menu,
} from "obsidian";
import { resolveViewModeDecision } from "./lib/view-mode";
import {
  CurrentViewSettings,
  DEFAULT_SETTINGS,
  migrateFolderRules,
  migrateFileLocks,
} from "./config/settings";
import { collectMatchedRules } from "./lib/rules";
import { addLockMenuItems, decorateFileExplorer, clearDecorations, LockTarget } from "./ui/context-menu";
import { normalizePath, isPathWithin } from "./config/settings";
import { CurrentViewSettingsTab } from "./ui/settings-tab";

type MarkdownViewState = {
  mode: "preview" | "source";
  source: boolean;
};

export default class CurrentViewSettingsPlugin extends Plugin {
  settings: CurrentViewSettings;
  openedFiles: String[];

  async onload() {
    await this.loadSettings();
    await migrateFolderRules(this.app, this.settings, () => this.saveSettings());
    await migrateFileLocks(this.settings, () => this.saveSettings());

    this.addSettingTab(new CurrentViewSettingsTab(this.app, this));

    this.openedFiles = resetOpenedNotes(this.app);

    const readViewModeFromFrontmatterAndToggle = async (leaf: WorkspaceLeaf) => {
      let view = leaf.view instanceof MarkdownView ? leaf.view : null;

      if (null === view) {
        if (true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      if (
        true == this.settings.ignoreAlreadyOpen &&
        view.file !== null &&
        alreadyOpen(view.file, this.openedFiles)
      ) {
        this.openedFiles = resetOpenedNotes(this.app);
        return;
      }

      const matchedRuleModes = collectMatchedRules(
        this.app,
        this.settings,
        view.file,
        (pattern) => (view.file ? view.file.basename.match(pattern) !== null : false)
      );

      const rawState = leaf.getViewState();
      const typedState = rawState as ViewState & { state: MarkdownViewState };
      if (!typedState.state) {
        typedState.state = {
          mode: view.getMode() === "preview" ? "preview" : "source",
          source: view.getMode() !== "preview",
        };
      }

      const fileCache = view.file ? this.app.metadataCache.getFileCache(view.file) : null;
      const rawFrontmatterValue = fileCache?.frontmatter?.[this.settings.customFrontmatterKey] ?? null;

      const { mode: resolvedMode, source } = resolveViewModeDecision({
        matchedRuleModes,
        frontmatterValue: rawFrontmatterValue,
        customFrontmatterKey: this.settings.customFrontmatterKey,
      });

      if (resolvedMode) {
        await applyViewMode(typedState, resolvedMode, view, leaf);
        if (source === "frontmatter" && true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      // @ts-ignore
      const defaultViewMode = this.app.vault.getConfig("defaultViewMode")
        ? // @ts-ignore
          this.app.vault.getConfig("defaultViewMode")
        : "source";
      // @ts-ignore
      const defaultEditingModeIsLivePreview =
        // @ts-ignore
        this.app.vault.getConfig("livePreview") === undefined
          ? true
          : // @ts-ignore
            this.app.vault.getConfig("livePreview");

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

    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        this.settings.debounceTimeout === 0
          ? readViewModeFromFrontmatterAndToggle
          : debounce(readViewModeFromFrontmatterAndToggle, this.settings.debounceTimeout)
      )
    );

    this.registerEvent(
      this.app.workspace.on("file-menu" as any, (menu: Menu, file: TFile | TFolder) => {
        const target: LockTarget = file instanceof TFolder ? "folder" : "file";
        addLockMenuItems(menu, file.path, target, this);
      })
    );

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
          if (normalizePath(r.path) === normalizePath(oldPath)) {
            changed = true;
            return { ...r, path: normalizePath(newPath) };
          }
          return r;
        });
        this.settings.filePatterns = this.settings.filePatterns.map((r) => {
          if (normalizePath(r.pattern) === normalizePath(oldPath)) {
            changed = true;
            return { ...r, pattern: normalizePath(newPath) };
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onunload() {
    clearDecorations();
    resetViewsToDefault(this);
    this.openedFiles = [];
  }
}

function alreadyOpen(currFile: TFile, openedFiles: String[]): boolean {
  const leavesWithSameNote: String[] = [];
  if (currFile == null) return false;
  openedFiles.forEach((openedFile: String) => {
    if (openedFile == currFile.basename) leavesWithSameNote.push(openedFile);
  });
  return leavesWithSameNote.length != 0;
}

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

const resetViewsToDefault = (plugin: CurrentViewSettingsPlugin) => {
  const leaves = plugin.app.workspace.getLeavesOfType("markdown");
  leaves.forEach((leaf) => {
    const view = leaf.view instanceof MarkdownView ? (leaf.view as MarkdownView) : null;
    if (!view) return;
    const state = leaf.getViewState();
    if (!state.state) return;
    // @ts-ignore
    const defaultViewMode = plugin.app.vault.getConfig("defaultViewMode")
      ? // @ts-ignore
        plugin.app.vault.getConfig("defaultViewMode")
      : "source";
    // @ts-ignore
    const defaultEditingModeIsLivePreview =
      // @ts-ignore
      plugin.app.vault.getConfig("livePreview") === undefined
        ? true
        : // @ts-ignore
          plugin.app.vault.getConfig("livePreview");
    state.state.mode = defaultViewMode;
    state.state.source = defaultEditingModeIsLivePreview ? false : true;
    leaf.setViewState(state);
  });
};
