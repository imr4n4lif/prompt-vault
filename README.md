# ⚡ PromptVault

A Chrome extension to save, organize, and reuse AI prompts from anywhere on the web.

## Features

- **Save prompts** from any page via right-click → "Save as Prompt" or `Ctrl+Shift+S`
- **Insert prompts** into any text field, textarea, or contenteditable (works with ChatGPT, Claude, Gemini, Notion, etc.)
- **Tag & search** — add tags when saving, filter by tag or keyword in the popup
- **Favorites** — star prompts to pin them to the top
- **Duplicate** prompts with one click
- **Export / Import** — backup and restore your prompts as JSON

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder

## Usage

| Action | How |
|---|---|
| Save selected text as a prompt | Highlight text → right-click → **Save as Prompt ⚡** |
| Save via keyboard | Select text → `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac) |
| Insert a prompt into a field | Right-click any editable field → **Insert Prompt ⚡** |
| Manage prompts | Click the extension icon in the toolbar |
| Export prompts | Popup → **↑** button |
| Import prompts | Popup → **↓** button |

## Project Structure

```
promptvault/
├── manifest.json      # Extension config (MV3)
├── background.js      # Service worker — context menus, keyboard shortcuts
├── content.js         # Save dialog & insert picker injected into pages
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic (list, search, filter, export/import)
└── icons/             # Extension icons (16, 48, 128px)
```

## Permissions Used

- `storage` — save prompts locally via `chrome.storage.local`
- `contextMenus` — right-click menu entries
- `activeTab` + `scripting` — inject content script for insert functionality

## License

MIT
