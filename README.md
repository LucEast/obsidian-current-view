# obsidian-current-view

Automatically set the view mode (Reading, Live Preview, or Source) of notes in Obsidian based on file patterns, folder paths, or frontmatter values.

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

1. Download the latest release from the GitHub [Releases](https://github.com/YOUR-USERNAME/obsidian-current-view/releases) page
2. Extract it into your Obsidian vault under `.obsidian/plugins/obsidian-current-view/`
3. Enable the plugin in **Settings → Community Plugins**

---

## 🛠 Development

Clone this repository and run:

```bash
npm install
npm run dev
```

This will watch your code and build to the `main.js` file on change.

---

## 📝 License

[MIT](LICENSE) – free to use and modify.
