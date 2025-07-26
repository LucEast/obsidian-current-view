# current-view

Automatically set the view mode (Reading, Live Preview, or Source) of notes in Obsidian based on file patterns, folder paths, or frontmatter values.

<p align="center">
  <a href="https://github.com/LucEast/obsidian-current-view/releases">
    <img src="https://img.shields.io/github/v/release/LucEast/obsidian-current-view?style=for-the-badge&label=latest&labelColor=363a4f&color=B4BEFE&logo=github&logoColor=cad3f5" alt="GitHub Release" />
  </a>
  <a href="https://github.com/LucEast/obsidian-current-view/releases">
    <img src="https://img.shields.io/github/downloads/LucEast/obsidian-current-view/total?style=for-the-badge&label=downloads&labelColor=363a4f&color=F9E2AF&logo=abdownloadmanager&logoColor=cad3f5" alt="Downloads" />
  </a>
  <a href="https://github.com/LucEast/obsidian-current-view/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/LucEast/obsidian-current-view/release.yml?branch=main&style=for-the-badge&label=CI&labelColor=363a4f&color=A6E3A1&logo=githubactions&logoColor=cad3f5" alt="CI Status" />
  </a>
  <a href="https://github.com/LucEast/obsidian-current-view/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/LucEast/obsidian-current-view?style=for-the-badge&labelColor=363a4f&color=FAB387&logo=open-source-initiative&logoColor=cad3f5" alt="License" />
  </a>
</p>

---

## 🔧 Features

- Automatically applies a specific view mode when opening notes
- Configure view mode defaults based on:
  - Folder path
  - File name pattern (RegEx)
  - Frontmatter metadata
- Supports:
  - `reading` → Preview mode
  - `source` → Source/Markdown mode
  - `live` → Live Preview mode
- Optional settings to:
  - Ignore already opened notes
  - Avoid forcing view if frontmatter is missing
  - Debounce view-switching to improve stability

---

## 🧠 View Mode Priority

When a note is opened, the plugin checks for a configured view mode in the following order:

1. **File pattern** match (e.g. all daily notes)
2. **Folder rule** (e.g. all notes in `Templates/`)
3. **Frontmatter field** (customizable key, default is `current view`)
4. **Obsidian default view** (fallback)

---

## 📑 Frontmatter Example

```yaml
current view: reading     # Options: reading, source, live
```

You can customize the frontmatter key in the plugin settings.

---

## ⚙️ Settings Overview

- `Frontmatter key`: Controls which frontmatter field to read (default: `current view`)
- `Ignore opened files`: Skips notes that were already open in the workspace
- `Ignore force view when not in frontmatter`: Don’t override view mode unless it’s explicitly set
- `Debounce timeout`: Prevents frequent re-triggering when switching between notes
- `Folder Rules`: Apply view mode to all notes in a specific folder
- `File Patterns`: Use RegEx patterns to match filenames

---

## 📦 Installation

### Obsidian

 1. Open Obsidian and go to Settings → Community Plugins.
 2. Click Browse and search for “https://github.com/LucEast/obsidian-current-view”.
 3. Click `Add Plugin`.

### BRAT

 1. Open the BRAT plugin in Obsidian.
 2. Search for “obsidian-current-view”.
 3. Click Install next to Current View.

### Manual

 1. Download the latest release from the GitHub Releases page.
 2. Extract the downloaded zip into your Obsidian vault under: `.obsidian/plugins/obsidian-current-view/`
 3. In Obsidian, go to Settings → Community Plugins, scroll down to Installed plugins, and toggle Current View on.

---

## 🛠 Development

Clone this obsidian-current-viewsitory and run:

```bash
npm install
npm run dev
```

This will watch your code and build to the `main.js` file on change.

---

## 📝 License

[MIT](LICENSE) – free to use and modify.
