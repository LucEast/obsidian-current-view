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

// Interface für die Plugin-Einstellungen
interface CurrentViewSettings {
  debounceTimeout: number; // Zeit in Millisekunden für das Debouncing
  customFrontmatterKey: string; // Benutzerdefinierte Frontmatter-Schlüssel
  ignoreAlreadyOpen: boolean; // Ob geöffnete Dateien ignoriert werden sollen
  ignoreForceViewAll: boolean; // Ob erzwungene Ansichtsänderungen ignoriert werden sollen
  folderRules: Array<{ path: string; mode: string }>; // Ordner mit zugewiesenen Ansichtsmodi
  filePatterns: Array<{ pattern: string; mode: string }>; // Dateien mit zugewiesenen Ansichtsmodi
}

// Standardwerte für die Plugin-Einstellungen
const DEFAULT_SETTINGS: CurrentViewSettings = {
  debounceTimeout: 300,
  customFrontmatterKey: "current view",
  ignoreAlreadyOpen: false,
  ignoreForceViewAll: false,
  folderRules: [],
  filePatterns: [],
};

// Hauptklasse des Plugins
export default class CurrentViewSettingsPlugin extends Plugin {
  settings: CurrentViewSettings; // Plugin-Einstellungen
  openedFiles: String[]; // Liste der geöffneten Dateien

  // Wird beim Laden des Plugins aufgerufen
  async onload() {
    // Einstellungen laden
    await this.loadSettings();

    // Einstellungs-Tab hinzufügen
    this.addSettingTab(new CurrentViewSettingsTab(this.app, this));

    // Geöffnete Dateien zurücksetzen
    this.openedFiles = resetOpenedNotes(this.app);

    // Funktion, um den Ansichtsmodus basierend auf Frontmatter zu ändern
    const readViewModeFromFrontmatterAndToggle = async (leaf: WorkspaceLeaf) => {
      // Überprüfen, ob die Ansicht ein MarkdownView ist
      let view = leaf.view instanceof MarkdownView ? leaf.view : null;

      if (null === view) {
        // Wenn keine Markdown-Ansicht und "ignoreAlreadyOpen" aktiviert ist, zurücksetzen
        if (true == this.settings.ignoreAlreadyOpen) {
          this.openedFiles = resetOpenedNotes(this.app);
        }
        return;
      }

      // Wenn die Datei bereits geöffnet ist und "ignoreAlreadyOpen" aktiviert ist, nichts tun
      if (
        true == this.settings.ignoreAlreadyOpen &&
        view.file !== null &&
        alreadyOpen(view.file, this.openedFiles)
      ) {
        this.openedFiles = resetOpenedNotes(this.app);
        return;
      }

      // Aktuellen Ansichtsstatus abrufen
      let state = leaf.getViewState();

      // Variable für den Ordner- oder Datei-Ansichtsmodus
      let folderOrFileModeState: string | null = null;

      // Funktion, um den Ansichtsmodus basierend auf einem Schlüssel zu setzen
      const setFolderOrFileModeState = (viewMode: string): void => {
        const [key, value] = viewMode.split(":").map((s) => s.trim());
        if (key === "default") {
          folderOrFileModeState = null; // Kein Zustand setzen
          return;
        }
        if (key !== this.settings.customFrontmatterKey) return;
        if (!["reading", "source", "live"].includes(value)) return;
        folderOrFileModeState = value;
      };

      // Überprüfen, ob die Datei in einem konfigurierten Ordner liegt
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

      // Überprüfen, ob die Datei einem konfigurierten Muster entspricht
      for (const { pattern, mode } of this.settings.filePatterns) {
        if (!pattern || !mode) continue;
        if (!state.state) continue;
        if (!view.file || !view.file.basename.match(pattern)) continue;
        setFolderOrFileModeState(mode);
      }

      // Anwenden, wenn ein Ordner- oder Datei-Ansichtsmodus gesetzt wurde
      if (folderOrFileModeState) {
        applyViewMode(state, folderOrFileModeState, view, leaf);
        return;
      }

      // Frontmatter auslesen
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

      // Fallback: Standard-View-Mode
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

    // Hilfsfunktion für die Ansicht
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

    // Event registrieren, um Ansichtsmodus bei Änderungen des aktiven Blatts zu setzen
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

  // Einstellungen laden
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  // Einstellungen speichern
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Wird beim Entladen des Plugins aufgerufen
  async onunload() {
    this.openedFiles = [];
  }
}

// Funktion, um zu überprüfen, ob eine Datei bereits geöffnet ist
function alreadyOpen(currFile: TFile, openedFiles: String[]): boolean {
  const leavesWithSameNote: String[] = [];
  if (currFile == null) return false;
  openedFiles.forEach((openedFile: String) => {
    if (openedFile == currFile.basename) leavesWithSameNote.push(openedFile);
  });
  return leavesWithSameNote.length != 0;
}

// Funktion, um die Liste der geöffneten Dateien zurückzusetzen
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

// Klasse für die Plugin-Einstellungen
class CurrentViewSettingsTab extends PluginSettingTab {
  plugin: CurrentViewSettingsPlugin

  constructor(app: App, plugin: CurrentViewSettingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Anzeige der Einstellungen
  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Current View').setHeading();

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

    const modes = [
      "default",
      `${this.plugin.settings.customFrontmatterKey}: reading`,
      `${this.plugin.settings.customFrontmatterKey}: source`,
      `${this.plugin.settings.customFrontmatterKey}: live`,
    ];

    new Setting(containerEl).setName('Folders').setHeading();

    const folderDesc = document.createDocumentFragment();
    folderDesc.append(
      "Specify a view mode for notes in a given folder.",
      folderDesc.createEl("br"),
      "Note that this will force the view mode on all the notes in the folder, even if they have a different view mode set in their frontmatter.",
      folderDesc.createEl("br"),
      "Precedence is from bottom (highest) to top (lowest), so if you have child folders specified, make sure to put them below their parent folder."
    );

    new Setting(this.containerEl).setDesc(folderDesc);

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

    new Setting(containerEl).setName('Files').setHeading();

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
