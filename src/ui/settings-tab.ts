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

    new Setting(this.containerEl)
      .setDesc(createFragment((f) => {
        f.appendText("You can control the view mode of a note using frontmatter or rules.Possible values are 'reading' (Preview), 'source' (Source Mode), or 'live' (Live Preview). You can also set a custom frontmatter key to control the view mode, which is currently set to:");
      }));

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

    new Setting(this.containerEl)
      .setDesc(createFragment((f) => {
        f.appendText("Specify a view mode for notes in a given folder.");
        f.createEl("br");
        f.appendText("Note that this will force the view mode on all the notes in the folder, even if they have a different view mode set in their frontmatter.");
        f.createEl("br");
        f.appendText("Precedence is from bottom (highest) to top (lowest), so if you have child folders specified, make sure to put them below their parent folder.");
      }));

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

    new Setting(containerEl).setName('Locked files').setHeading();
    new Setting(containerEl)
      .setName("Show lock icons in explorer")
      .setDesc("Toggle inline icons for locked files/folders in the file explorer.")
      .addToggle((cb) => {
        cb.setValue(this.plugin.settings.showExplorerIcons).onChange(async (value) => {
          this.plugin.settings.showExplorerIcons = value;
          await this.plugin.saveSettings();
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

    this.plugin.settings.filePatterns
      .filter((rule) => rule.pattern && rule.mode)
      .forEach((rule, index) => {
        const s = new Setting(this.containerEl)
          .addText((cb) => {
            cb.setPlaceholder("folder/file.md")
              .setValue(rule.pattern)
              .onChange(async (value) => {
                this.plugin.settings.filePatterns[index].pattern = value;
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
      });
  }
}
