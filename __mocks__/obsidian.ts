export type ViewState = { state?: Record<string, unknown> };

export class Plugin {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
  addSettingTab() {}
  registerEvent() {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement | Record<string, unknown>;
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = { empty: () => {}, createEl: () => ({}) };
  }
}

export class Setting {
  containerEl: unknown;
  constructor(el: unknown) {
    this.containerEl = el;
  }
  setDesc() {
    return this;
  }
  setName() {
    return this;
  }
  addText() {
    return this;
  }
  addToggle() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addExtraButton() {
    return this;
  }
  addButton() {
    return this;
  }
  setHeading() {
    return this;
  }
}

export class MarkdownView {
  file: TFile | null;
  private mode: "preview" | "source";
  constructor(file: TFile | null = null) {
    this.file = file;
    this.mode = "source";
  }
  getMode() {
    return this.mode;
  }
}

export class TFile {
  basename: string;
  parent: TFolder | null;
  path: string;
  constructor(path: string) {
    this.path = path;
    this.basename = path.split("/").pop() || path;
    this.parent = null;
  }
}

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class WorkspaceLeaf {
  view: MarkdownView | null;
  private viewState: ViewState;
  constructor(view: MarkdownView | null = null) {
    this.view = view;
    this.viewState = { state: { mode: "source", source: true } };
  }
  async setViewState(state: ViewState) {
    this.viewState = state;
    return Promise.resolve();
  }
  getViewState(): ViewState {
    return this.viewState;
  }
}

export class App {
  vault: {
    getConfig: (key: string) => unknown;
    getAbstractFileByPath: (path: string) => TFolder | null;
  };
  workspace: {
    on: () => void;
    iterateAllLeaves: (_fn: (leaf: WorkspaceLeaf) => void) => void;
  };
  metadataCache: {
    getFileCache: (_file: TFile) => { frontmatter?: Record<string, unknown> } | null;
  };

  constructor() {
    this.vault = {
      getConfig: () => null,
      getAbstractFileByPath: () => null,
    };
    this.workspace = {
      on: () => undefined,
      iterateAllLeaves: () => undefined,
    };
    this.metadataCache = {
      getFileCache: () => null,
    };
  }
}

export const debounce = (fn: (...args: unknown[]) => unknown) => fn;
