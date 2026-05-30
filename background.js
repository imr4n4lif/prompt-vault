// PromptVault — background.js (service worker)

// ── Context menu setup ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // On selected text → save it
    chrome.contextMenus.create({
      id: "save-as-prompt",
      title: "Save as Prompt ⚡",
      contexts: ["selection"],
    });
    // On editable fields → insert a prompt
    chrome.contextMenus.create({
      id: "insert-prompt",
      title: "Insert Prompt ⚡",
      contexts: ["editable"],
    });
  });
});

// ── Context menu click ────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-as-prompt" && info.selectionText) {
    injectThen(tab.id, { type: "OPEN_SAVE_DIALOG", text: info.selectionText.trim() });
  }
  if (info.menuItemId === "insert-prompt") {
    injectThen(tab.id, { type: "OPEN_INSERT_PICKER" });
  }
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save-selection") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() || "",
    }).then((results) => {
      const text = results?.[0]?.result;
      if (text) injectThen(tab.id, { type: "OPEN_SAVE_DIALOG", text });
    }).catch(console.error);
  }
});

// ── Helper: inject content.js first, then message it ─────────────────────────
function injectThen(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  }).then(() => {
    chrome.tabs.sendMessage(tabId, message);
  }).catch((err) => {
    console.warn("PromptVault:", err.message);
  });
}
