// PromptVault — content.js
if (typeof window.__promptVaultLoaded === "undefined") {
  window.__promptVaultLoaded = true;

  let saveDialog = null, saveOverlay = null;
  let pickerDialog = null, pickerOverlay = null;

  // ── Message router ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "OPEN_SAVE_DIALOG" && msg.text) showSaveDialog(msg.text);
    if (msg.type === "OPEN_INSERT_PICKER")            showInsertPicker();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SAVE DIALOG
  // ════════════════════════════════════════════════════════════════════════════
  function showSaveDialog(selectedText) {
    removeSaveDialog();
    injectStyles();

    saveOverlay = mkEl("div", { id: "pv-overlay" });
    saveOverlay.addEventListener("click", removeSaveDialog);

    saveDialog = mkEl("div", { id: "pv-dialog" });
    saveDialog.innerHTML = `
      <div class="pv-header">
        <span class="pv-logo">⚡ PromptVault</span>
        <button class="pv-close" id="pv-close-btn">✕</button>
      </div>
      <div class="pv-body">
        <label class="pv-label">Title</label>
        <input class="pv-input" id="pv-title" type="text" placeholder="Auto-generated if empty" />
        <label class="pv-label">Prompt Preview</label>
        <div class="pv-preview">${escHtml(selectedText.length > 300 ? selectedText.slice(0,300)+"…" : selectedText)}</div>
        <label class="pv-label">Tags <span class="pv-hint">(comma separated)</span></label>
        <input class="pv-input" id="pv-tags" type="text" placeholder="e.g. coding, writing, GPT" />
      </div>
      <div class="pv-footer">
        <button class="pv-btn-secondary" id="pv-cancel-btn">Cancel</button>
        <button class="pv-btn-primary" id="pv-save-btn">Save Prompt</button>
      </div>`;

    const titleInput = saveDialog.querySelector("#pv-title");
    titleInput.value = autoTitle(selectedText);

    const doSave = () => savePrompt(
      selectedText,
      titleInput.value.trim(),
      saveDialog.querySelector("#pv-tags").value.trim()
    );

    saveDialog.querySelector("#pv-close-btn").addEventListener("click", removeSaveDialog);
    saveDialog.querySelector("#pv-cancel-btn").addEventListener("click", removeSaveDialog);
    saveDialog.querySelector("#pv-save-btn").addEventListener("click", doSave);
    saveDialog.addEventListener("click", e => e.stopPropagation());
    saveDialog.addEventListener("keydown", e => {
      if (e.key === "Escape") removeSaveDialog();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") doSave();
    });

    document.body.appendChild(saveOverlay);
    document.body.appendChild(saveDialog);
    titleInput.focus(); titleInput.select();
  }

  function savePrompt(text, title, tagsRaw) {
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];
    chrome.storage.local.get(["prompts"], res => {
      const prompts = res.prompts || [];
      prompts.unshift({ id: Date.now().toString(), title: title || autoTitle(text), text, tags, favorite: false, createdAt: new Date().toISOString() });
      chrome.storage.local.set({ prompts }, () => { showToast("Prompt saved! ⚡"); removeSaveDialog(); });
    });
  }

  function removeSaveDialog() {
    saveDialog?.remove(); saveOverlay?.remove();
    saveDialog = null; saveOverlay = null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INSERT PICKER
  // ════════════════════════════════════════════════════════════════════════════
  function showInsertPicker() {
    removeInsertPicker();
    injectStyles();

    // Remember the focused editable element BEFORE the picker steals focus
    const targetEl = document.activeElement;

    pickerOverlay = mkEl("div", { id: "pv-overlay" });
    pickerOverlay.addEventListener("click", removeInsertPicker);

    pickerDialog = mkEl("div", { id: "pv-picker" });
    pickerDialog.innerHTML = `
      <div class="pv-header">
        <span class="pv-logo">⚡ Insert Prompt</span>
        <button class="pv-close" id="pvp-close">✕</button>
      </div>
      <div class="pvp-search-wrap">
        <span class="pvp-search-icon">⌕</span>
        <input class="pvp-search" id="pvp-search" type="text" placeholder="Search prompts…" autocomplete="off" />
      </div>
      <div class="pvp-tag-strip" id="pvp-tags"></div>
      <div class="pvp-list" id="pvp-list">
        <div class="pvp-loading">Loading…</div>
      </div>`;

    pickerDialog.querySelector("#pvp-close").addEventListener("click", removeInsertPicker);
    pickerDialog.addEventListener("click", e => e.stopPropagation());

    document.body.appendChild(pickerOverlay);
    document.body.appendChild(pickerDialog);

    // Load prompts and render
    chrome.storage.local.get(["prompts"], res => {
      const prompts = res.prompts || [];
      renderPicker(prompts, targetEl);
    });
  }

  function renderPicker(prompts, targetEl) {
    const list = pickerDialog.querySelector("#pvp-list");
    const searchInput = pickerDialog.querySelector("#pvp-search");
    const tagStrip = pickerDialog.querySelector("#pvp-tags");
    let activeTag = null;

    // Build tag strip
    const tagCounts = {};
    prompts.forEach(p => (p.tags || []).forEach(t => tagCounts[t] = (tagCounts[t]||0)+1));
    const tags = Object.keys(tagCounts).sort();
    if (tags.length) {
      tags.forEach(tag => {
        const pill = mkEl("button", { className: "pvp-tag-pill" });
        pill.textContent = `${tag} ${tagCounts[tag]}`;
        pill.addEventListener("click", () => {
          activeTag = activeTag === tag ? null : tag;
          pickerDialog.querySelectorAll(".pvp-tag-pill").forEach(p => p.classList.remove("active"));
          if (activeTag) pill.classList.add("active");
          renderList(searchInput.value);
        });
        tagStrip.appendChild(pill);
      });
    } else {
      tagStrip.style.display = "none";
    }

    function renderList(query) {
      list.innerHTML = "";
      let filtered = [...prompts];
      if (activeTag) filtered = filtered.filter(p => (p.tags||[]).includes(activeTag));
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.text.toLowerCase().includes(q) ||
          (p.tags||[]).some(t => t.toLowerCase().includes(q))
        );
      }
      // Favorites first
      filtered.sort((a,b) => (b.favorite?1:0)-(a.favorite?1:0));

      if (!filtered.length) {
        list.innerHTML = `<div class="pvp-empty">${prompts.length ? "No matches found." : "No prompts saved yet."}</div>`;
        return;
      }

      filtered.forEach(p => {
        const item = mkEl("div", { className: "pvp-item" });
        const tagsHtml = (p.tags||[]).map(t => `<span class="pvp-item-tag">${escHtml(t)}</span>`).join("");
        item.innerHTML = `
          <div class="pvp-item-top">
            <span class="pvp-item-title">${escHtml(p.title)}${p.favorite ? ' <span class="pvp-fav-star">★</span>' : ""}</span>
            <button class="pvp-item-insert-btn">Insert</button>
          </div>
          <div class="pvp-item-preview">${escHtml(p.text.replace(/\s+/g," ").trim().slice(0,120))}${p.text.length>120?"…":""}</div>
          ${tagsHtml ? `<div class="pvp-item-tags">${tagsHtml}</div>` : ""}`;

        item.querySelector(".pvp-item-insert-btn").addEventListener("click", () => {
          insertIntoElement(targetEl, p.text);
          removeInsertPicker();
          showToast("Prompt inserted! ⚡");
        });

        // Also allow clicking the whole card (excluding the button)
        item.addEventListener("click", (e) => {
          if (e.target.classList.contains("pvp-item-insert-btn")) return;
          insertIntoElement(targetEl, p.text);
          removeInsertPicker();
          showToast("Prompt inserted! ⚡");
        });

        list.appendChild(item);
      });
    }

    searchInput.addEventListener("input", () => renderList(searchInput.value));
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Escape") removeInsertPicker();
    });

    renderList("");
    setTimeout(() => searchInput.focus(), 50);
  }

  function insertIntoElement(el, text) {
    if (!el) return;
    const tag = el.tagName?.toLowerCase();
    // Standard input / textarea
    if (tag === "textarea" || (tag === "input" && ["text","search","url","email"].includes(el.type))) {
      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? el.value.length;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus();
      return;
    }
    // contenteditable (ChatGPT, Claude, Gemini, Notion, etc.)
    if (el.isContentEditable || el.closest?.("[contenteditable]")) {
      const target = el.isContentEditable ? el : el.closest("[contenteditable]");
      target.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Fallback: append to end
        target.textContent += text;
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    // Last resort: clipboard copy
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard (couldn't detect field)"));
  }

  function removeInsertPicker() {
    pickerDialog?.remove(); pickerOverlay?.remove();
    pickerDialog = null; pickerOverlay = null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ════════════════════════════════════════════════════════════════════════════
  function autoTitle(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
  }

  function escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function mkEl(tag, props = {}) {
    return Object.assign(document.createElement(tag), props);
  }

  function showToast(msg) {
    document.getElementById("pv-toast")?.remove();
    const toast = mkEl("div", { id: "pv-toast", textContent: msg });
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("pv-toast-show"), 10);
    setTimeout(() => { toast.classList.remove("pv-toast-show"); setTimeout(() => toast.remove(), 300); }, 2200);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STYLES
  // ════════════════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById("pv-styles")) return;
    const style = mkEl("style", { id: "pv-styles" });
    style.textContent = `
      /* ── Shared overlay ── */
      #pv-overlay {
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        backdrop-filter:blur(2px);z-index:2147483645;
      }

      /* ── Save dialog ── */
      #pv-dialog {
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        width:420px;background:#131316;border:1px solid #2a2a30;
        border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.7);
        z-index:2147483647;font-family:'Segoe UI',system-ui,sans-serif;
        font-size:14px;color:#e8e8ec;overflow:hidden;
      }

      /* ── Insert picker ── */
      #pv-picker {
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        width:460px;max-height:520px;background:#131316;
        border:1px solid #2a2a30;border-radius:14px;
        box-shadow:0 24px 64px rgba(0,0,0,0.7);
        z-index:2147483647;font-family:'Segoe UI',system-ui,sans-serif;
        font-size:14px;color:#e8e8ec;overflow:hidden;
        display:flex;flex-direction:column;
      }

      /* ── Shared header ── */
      .pv-header {
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 16px 12px;border-bottom:1px solid #22222a;flex-shrink:0;
      }
      .pv-logo { font-weight:700;font-size:13px;color:#c8b8ff;letter-spacing:0.02em; }
      .pv-close {
        background:none;border:none;cursor:pointer;color:#666;
        font-size:15px;padding:2px 5px;border-radius:4px;
        transition:color 0.15s,background 0.15s;
      }
      .pv-close:hover { color:#e8e8ec;background:#2a2a30; }

      /* ── Picker search ── */
      .pvp-search-wrap {
        display:flex;align-items:center;gap:8px;
        padding:10px 14px 8px;border-bottom:1px solid #1e1e26;flex-shrink:0;
      }
      .pvp-search-icon { color:#444;font-size:18px;line-height:1; }
      .pvp-search {
        flex:1;background:none;border:none;outline:none;
        color:#e8e8ec;font-size:13px;font-family:inherit;
      }
      .pvp-search::placeholder { color:#444; }

      /* ── Picker tag strip ── */
      .pvp-tag-strip {
        display:flex;flex-wrap:nowrap;gap:5px;padding:7px 14px;
        overflow-x:auto;scrollbar-width:none;flex-shrink:0;
        border-bottom:1px solid #1e1e26;
      }
      .pvp-tag-strip::-webkit-scrollbar { display:none; }
      .pvp-tag-pill {
        background:#1c1c24;border:1px solid #2a2a35;color:#888;
        border-radius:999px;padding:3px 10px;font-size:11px;font-weight:500;
        cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:inherit;
        transition:background 0.12s,color 0.12s,border-color 0.12s;
      }
      .pvp-tag-pill:hover,.pvp-tag-pill.active {
        background:rgba(124,106,255,0.12);color:#7c6aff;border-color:#7c6aff;
      }

      /* ── Picker list ── */
      .pvp-list {
        flex:1;overflow-y:auto;padding:6px;
        display:flex;flex-direction:column;gap:4px;
        scrollbar-width:thin;scrollbar-color:#2a2a35 transparent;
      }
      .pvp-list::-webkit-scrollbar { width:4px; }
      .pvp-list::-webkit-scrollbar-thumb { background:#2a2a35;border-radius:4px; }

      /* ── Picker item ── */
      .pvp-item {
        background:#1a1a22;border:1px solid #26262e;border-radius:9px;
        padding:10px 12px;cursor:pointer;
        transition:border-color 0.12s,background 0.12s;
      }
      .pvp-item:hover { background:#202028;border-color:#7c6aff; }
      .pvp-item-top {
        display:flex;align-items:center;justify-content:space-between;
        gap:8px;margin-bottom:5px;
      }
      .pvp-item-title {
        font-size:13px;font-weight:600;color:#e4e4ea;
        flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      .pvp-fav-star { color:#fbbf24;font-size:12px; }
      .pvp-item-insert-btn {
        background:#7c6aff;border:none;color:#fff;
        padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;
        font-family:inherit;cursor:pointer;flex-shrink:0;
        transition:background 0.12s,transform 0.1s;
      }
      .pvp-item-insert-btn:hover { background:#6b58ee; }
      .pvp-item-insert-btn:active { transform:scale(0.96); }
      .pvp-item-preview {
        font-size:12px;color:#777;line-height:1.5;
        overflow:hidden;display:-webkit-box;
        -webkit-line-clamp:2;-webkit-box-orient:vertical;
        word-break:break-word;
      }
      .pvp-item-tags { display:flex;flex-wrap:wrap;gap:4px;margin-top:7px; }
      .pvp-item-tag {
        background:rgba(124,106,255,0.1);color:#7c6aff;
        border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;
      }
      .pvp-empty {
        text-align:center;color:#555;padding:30px 0;font-size:13px;
      }
      .pvp-loading { text-align:center;color:#555;padding:30px 0;font-size:13px; }

      /* ── Save dialog body ── */
      .pv-body { padding:14px 16px;display:flex;flex-direction:column;gap:10px; }
      .pv-label {
        font-size:11px;font-weight:600;letter-spacing:0.06em;
        text-transform:uppercase;color:#888;margin-bottom:2px;
      }
      .pv-hint { font-weight:400;text-transform:none;letter-spacing:0;color:#555; }
      .pv-input {
        background:#1c1c22;border:1px solid #2a2a35;border-radius:8px;
        padding:9px 12px;color:#e8e8ec;font-size:14px;font-family:inherit;
        outline:none;transition:border-color 0.15s;width:100%;box-sizing:border-box;
      }
      .pv-input:focus { border-color:#7c6aff; }
      .pv-preview {
        background:#1a1a20;border:1px solid #26262e;border-radius:8px;
        padding:10px 12px;color:#aaa;font-size:13px;line-height:1.55;
        max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;
      }
      .pv-footer {
        display:flex;gap:8px;justify-content:flex-end;
        padding:12px 16px 14px;border-top:1px solid #22222a;
      }
      .pv-btn-secondary {
        background:#22222a;border:1px solid #2e2e38;color:#aaa;
        padding:7px 14px;border-radius:8px;cursor:pointer;
        font-size:13px;font-family:inherit;transition:background 0.15s;
      }
      .pv-btn-secondary:hover { background:#2a2a35;color:#e8e8ec; }
      .pv-btn-primary {
        background:#7c6aff;border:none;color:#fff;padding:7px 16px;
        border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
        font-family:inherit;transition:background 0.15s,transform 0.1s;
      }
      .pv-btn-primary:hover { background:#6b58ee; }
      .pv-btn-primary:active { transform:scale(0.98); }

      /* ── Toast ── */
      #pv-toast {
        position:fixed;bottom:28px;left:50%;
        transform:translateX(-50%) translateY(12px);
        background:#7c6aff;color:#fff;padding:10px 20px;
        border-radius:999px;font-family:'Segoe UI',system-ui,sans-serif;
        font-size:13px;font-weight:600;
        box-shadow:0 8px 24px rgba(124,106,255,0.4);
        z-index:2147483647;opacity:0;
        transition:opacity 0.25s,transform 0.25s;
      }
      #pv-toast.pv-toast-show { opacity:1;transform:translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(style);
  }

} // end guard
