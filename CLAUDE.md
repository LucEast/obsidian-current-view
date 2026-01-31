# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode - builds main.js on change
npm run build        # Production build (type-check + bundle)
npm run test         # Run all tests once
npm run test:watch   # Watch mode for tests
npm run coverage     # V8 coverage report
```

## Architecture Overview

This is an Obsidian plugin that automatically sets view modes (Reading, Live Preview, Source) for notes based on configurable rules.

### Source Structure

- `src/main.ts` - Plugin entry point. Registers `active-leaf-change` event listener (with optional debounce), context menus for file/folder locking, and file explorer decorations. Contains the core `readViewModeFromFrontmatterAndToggle` logic.
- `src/config/settings.ts` - Settings interface (`CurrentViewSettings`), defaults, path normalization utilities, and migration functions for legacy data.
- `src/lib/view-mode.ts` - Pure functions for view mode resolution. `resolveViewModeDecision()` is the main decision function that takes matched rules and frontmatter, returns the final mode.
- `src/lib/rules.ts` - Rule matching logic. `collectMatchedRules()` gathers all applicable folder/file pattern rules. `resolveFrontmatterMode()` extracts mode from note frontmatter.
- `src/ui/context-menu.ts` - File explorer context menu integration and lock badge decorations.
- `src/ui/settings-tab.ts` - Plugin settings UI.

### View Mode Priority

When resolving which mode to apply (in `resolveViewModeDecision`):
1. File pattern rules (exact path or regex match)
2. Folder rules (deepest matching folder wins)
3. Frontmatter value (customizable key, default `current view`)
4. Obsidian default view mode (fallback)

### Testing

Tests live in `__tests__/`. Obsidian API mocks are in `__mocks__/obsidian.ts`. The testing strategy prefers pure helper functions in `view-mode.ts` that can be tested without Obsidian dependencies.

## Conventions

- Use conventional commits: `fix:`, `feat:`, `chore:`, `test:`
- Keep PRs small with behavioral descriptions
- Run `npm run test && npm run build` locally before PRs
