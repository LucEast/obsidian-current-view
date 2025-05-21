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
} from "obsidian";

// Interface for plugin settings
interface CurrentViewSettings {
  debounceTimeout: number; // Time in milliseconds to wait before applying the view mode
  customFrontmatterKey: string; // user-defined frontmatter key to control the view mode
  ignoreAlreadyOpen: boolean; // If true, the plugin will not change the view mode of already opened notes
  ignoreForceViewAll: boolean; // If true, the plugin will not change the view mode of notes opened from another one in a certain view mode
  folderRules: Array<{ path: string; mode: string }>; // Folder rules with assigned view modes
  filePatterns: Array<{ pattern: string; mode: string }>; // File patterns with assigned view modes
}

// defaults for plugin settings
const DEFAULT_SETTINGS: CurrentViewSettings = {
  debounceTimeout: 300,
  customFrontmatterKey: "current view",
  ignoreAlreadyOpen: false,
  ignoreForceViewAll: false,
  folderRules: [{path: "", mode: ""}],
  filePatterns: [{pattern: "", mode: ""}],
};

// main plugin class
export default class CurrentViewSettingsPlugin extends Plugin {
  settings: CurrentViewSettings; 
  openedFiles: String[]; // List of opened files

  // gets called when the plugin is loaded
  async onload() {
    // load settings
    await this.loadSettings();

    // Add the settings tab to the Obsidian settings UI
    this.addSettingTab(new CurrentViewSettingsTab(this.app, this));

    // Initialize the list of currently opened files
    this.openedFiles = resetOpenedNotes(this.app);

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

      // Variable for folder or file pattern view mode
      let folderOrFileModeState: string | null = null;

      // Helper: set folderOrFileModeState if a matching rule is found
      const setFolderOrFileModeState = (viewMode: string): void => {
        const [key, value] = viewMode.split(":").map((s) => s.trim());
        if (key === "default") {
          folderOrFileModeState = null; // Do not set any mode
          return;
        }
        if (key !== this.settings.customFrontmatterKey) return;
        if (!["reading", "source", "live"].includes(value)) return;
        folderOrFileModeState = value;
      };

      // Check if the file is in a configured folder and set mode if so
      for (const folderMode of this.settings.folderRules) {
        if (folderMode.path !== "" && folderMode.mode) {
          const folder = this.app.vault.getAbstractFileByPath(folderMode.path);
          if (folder instanceof TFolder) {
            if (
              view.file &&
              (view.file.parent === folder || (view.file.parent && view.file.parent.path.startsWith(folder.path)))
            ) {
              if (!state.state) {
                continue;
              }
              setFolderOrFileModeState(folderMode.mode);
            }
          } else {
            console.warn(`ForceViewMode: Folder ${folderMode.path} does not exist or is not a folder.`);
          }
        }
      }

      // Check if the file matches a configured pattern and set mode if so
      for (const { pattern, mode } of this.settings.filePatterns) {
        if (!pattern || !mode) continue;
        if (!state.state) continue;
        if (!view.file || !view.file.basename.match(pattern)) continue;
        setFolderOrFileModeState(mode);
      }

      // If a folder or file pattern mode was set, apply it and return
      if (folderOrFileModeState) {
        applyViewMode(state, folderOrFileModeState, view, leaf);
        return;
      }

      // Read frontmatter value for the custom key
      const fileCache = view.file ? this.app.metadataCache.getFileCache(view.file) : null;
      const fmValue =
        fileCache !== null && fileCache.frontmatter
          ? fileCache.frontmatter[this.settings.customFrontmatterKey]
          : null;

      if (typeof fmValue === "string" && ["reading", "source", "live"].includes(fmValue)) {
        applyViewMode(state, fmValue, view, leaf);
        if (true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      // Fallback: apply the default view mode from Obsidian settings
      // @ts-ignore
      const defaultViewMode = this.app.workspace.getConfig("defaultViewMode")
        // @ts-ignore
        ? this.app.workspace.getConfig("defaultViewMode")
        : "source";
      // @ts-ignore
      const defaultEditingModeIsLivePreview =
        // @ts-ignore
        this.app.workspace.getConfig("livePreview") === undefined
          ? true
          // @ts-ignore
          : this.app.workspace.getConfig("livePreview");

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
      state: any,
      value: string,
      view: MarkdownView,
      leaf: WorkspaceLeaf
    ) => {
      if (value === "reading") {
        state.state.mode = "preview";
        state.state.source = false;
      } else if (value === "source") {
        state.state.mode = "source";
        state.state.source = true;
      } else if (value === "live") {
        state.state.mode = "source";
        state.state.source = false;
      }
      await leaf.setViewState(state);
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

    // Heading for the settings section
    new Setting(containerEl).setName('Current View').setHeading();

    // General info about the plugin and frontmatter usage
    const generalSettingsText = document.createDocumentFragment();
    generalSettingsText.append(
      "You can control the view mode of a note using the frontmatter key ",
      generalSettingsText.createEl("code", { text: this.plugin.settings.customFrontmatterKey }),
      ". Possible values are ",
      generalSettingsText.createEl("code", { text: "reading" }),
      " (Preview), ",
      generalSettingsText.createEl("code", { text: "source" }),
      " (Source Mode), or ",
      generalSettingsText.createEl("code", { text: "live" }),
      " (Live Preview)."
    );

    new Setting(this.containerEl).setDesc(generalSettingsText);

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

    // Description for folder rules
    const folderDesc = document.createDocumentFragment();
    folderDesc.append(
      "Specify a view mode for notes in a given folder.",
      folderDesc.createEl("br"),
      "Note that this will force the view mode on all the notes in the folder, even if they have a different view mode set in their frontmatter.",
      folderDesc.createEl("br"),
      "Precedence is from bottom (highest) to top (lowest), so if you have child folders specified, make sure to put them below their parent folder."
    );

    new Setting(this.containerEl).setDesc(folderDesc);

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

    // Description for file pattern rules
    const filesDesc = document.createDocumentFragment();
    filesDesc.append(
      "Specify a view mode for notes with specific patterns (regular expression; example \" - All$\" for all notes ending with \" - All\" or \"1900-01\" for all daily notes starting with \"1900-01\"",
      filesDesc.createEl("br"),
      "Note that this will force the view mode, even if it have a different view mode set in its frontmatter.",
      filesDesc.createEl("br"),
      "Precedence is from bottom (highest) to top (lowest).",
      filesDesc.createEl("br"),
      "Notice that configuring a file pattern will override the folder configuration for the same file."
    );

    new Setting(this.containerEl).setDesc(filesDesc);

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
  }
}
