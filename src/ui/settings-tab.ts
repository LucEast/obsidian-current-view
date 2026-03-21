import { App, PluginSettingTab, Setting } from "obsidian";
import type CurrentViewSettingsPlugin from "../main";

export class CurrentViewSettingsTab extends PluginSettingTab {
  plugin: CurrentViewSettingsPlugin;

  constructor(app: App, plugin: CurrentViewSettingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    // Introduction
    containerEl.createDiv({ 
      text: "Control view modes (Reading, Live Preview, Source) for your notes using frontmatter or rules.",
      cls: "setting-item-description"
    });

    // === General Settings ===
    new Setting(containerEl).setName("General").setHeading();

    new Setting(containerEl)
      .setName("Frontmatter key")
      .setDesc("Custom frontmatter field to define view mode per note.")
      .addText((text) => {
        text
          .setPlaceholder("current view")
          .setValue(this.plugin.settings.customFrontmatterKey)
          .onChange(async (value) => {
            this.plugin.settings.customFrontmatterKey = value || "current view";
            await this.plugin.saveSettings();
          });
        // Refresh dropdowns only after the user leaves the field, not on every keystroke
        text.inputEl.addEventListener("blur", () => this.display());
      });

    new Setting(containerEl)
      .setName("Debounce timeout")
      .setDesc("Delay in milliseconds before applying view mode. Set to 0 to disable. Increase if experiencing issues.")
      .addText((cb) => {
        cb.setPlaceholder("300")
          .setValue(String(this.plugin.settings.debounceTimeout))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.debounceTimeout = isNaN(num) ? 300 : num;
            await this.plugin.saveSettings();
          });
      });

    // === Behavior ===
    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("Ignore already opened files")
      .setDesc("Don't change view mode for notes that are already open in the workspace.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ignoreAlreadyOpen)
          .onChange(async (value) => {
            this.plugin.settings.ignoreAlreadyOpen = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Require frontmatter to force view")
      .setDesc("Only apply rules if the note has an explicit frontmatter view mode set.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ignoreForceViewAll)
          .onChange(async (value) => {
            this.plugin.settings.ignoreForceViewAll = value;
            await this.plugin.saveSettings();
          });
      });

    // === Visual Feedback ===
    new Setting(containerEl).setName("Visual Feedback").setHeading();

    new Setting(containerEl)
      .setName("Show lock icons")
      .setDesc("Display lock status icons next to files and folders in File Explorer and Notebook Navigator.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showExplorerIcons)
          .onChange(async (value) => {
            this.plugin.settings.showExplorerIcons = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show lock notifications")
      .setDesc("Display a notice when locking or unlocking files/folders via context menu.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showLockNotifications)
          .onChange(async (value) => {
            this.plugin.settings.showLockNotifications = value;
            await this.plugin.saveSettings();
          });
      });

    const modes = [
      "default",
      `${this.plugin.settings.customFrontmatterKey}: reading`,
      `${this.plugin.settings.customFrontmatterKey}: source`,
      `${this.plugin.settings.customFrontmatterKey}: live`,
    ];

    // === Folder Rules ===
    new Setting(containerEl).setName("Folder Rules").setHeading();
    
    new Setting(containerEl)
      .setDesc("Apply view mode to all notes in a folder. Use the context menu (right-click) on folders to quickly lock them. Order matters: rules are checked from bottom (highest priority) to top (lowest priority).");

    new Setting(containerEl)
      .setName("Add folder rule")
      .setDesc("Click to add a new folder rule")
      .addButton((button) => {
        button
          .setTooltip("Add folder rule")
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

    // === Tag Rules ===
    new Setting(containerEl).setName("Tag Rules").setHeading();

    new Setting(containerEl)
      .setDesc("Apply view mode to notes that have a specific tag. Tag rules override folder rules but can be overridden by file pattern rules.");

    new Setting(containerEl)
      .setName("Add tag rule")
      .setDesc("Click to add a new tag rule")
      .addButton((button) => {
        button
          .setTooltip("Add tag rule")
          .setButtonText("+")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.tagRules.push({ tag: "", mode: "" });
            await this.plugin.saveSettings();
            this.display();
          });
      });

    this.plugin.settings.tagRules.forEach((tagRule, index) => {
      const div = containerEl.createEl("div");
      div.addClass("force-view-mode-div");
      div.addClass("force-view-mode-folder");

      const s = new Setting(this.containerEl)
        .addSearch((cb) => {
          cb.setPlaceholder("Example: sent, published")
            .setValue(tagRule.tag)
            .onChange(async (value) => {
              if (
                value &&
                this.plugin.settings.tagRules.some((e) => e.tag === value)
              ) {
                console.error("ForceViewMode: Tag rule already exists", value);
                return;
              }
              this.plugin.settings.tagRules[index].tag = value;
              await this.plugin.saveSettings();
            });
        })
        .addDropdown((cb) => {
          modes.forEach((mode) => {
            cb.addOption(mode, mode);
          });
          cb.setValue(tagRule.mode || "default").onChange(async (value) => {
            this.plugin.settings.tagRules[index].mode = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((cb) => {
          cb.setIcon("cross")
            .setTooltip("Delete")
            .onClick(async () => {
              this.plugin.settings.tagRules.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      s.infoEl.remove();
      div.appendChild(containerEl.lastChild as Node);
    });

    // === File Pattern Rules ===
    new Setting(containerEl).setName("File Pattern Rules").setHeading();
    
    new Setting(containerEl)
      .setDesc("Match files using RegEx patterns or exact paths. Use the context menu (right-click) on files to quickly lock them. Examples: \" - All$\" (files ending with \" - All\"), \"^2024-\" (files starting with \"2024-\"). Note: File patterns override folder rules for matching files.");

    new Setting(containerEl)
      .setName("Add file pattern")
      .setDesc("Click to add a new file pattern rule")
      .addButton((button) => {
        button
          .setTooltip("Add file pattern")
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
