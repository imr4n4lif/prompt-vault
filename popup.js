// PromptVault — popup.js

"use strict";

// ── State ────────────────────────────────────────────────────────────────────
let allPrompts = [];
let activeTag = null;
let searchQuery = "";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search-input");
const clearBtn    = document.getElementById("clear-search");
const tagStrip    = document.getElementById("tag-strip");
const statBar     = document.getElementById("stats-bar");
const listEl      = document.getElementById("prompt-list");
const emptyState  = document.getElementById("empty-state");
const btnExport   = document.getElementById("btn-export");
const btnImport   = document.getElementById("btn-import");
const importFile  = document.getElementById("import-file");

// ── Init ─────────────────────────────────────────────────────────────────────
loadPrompts();

// ── Load prompts ─────────────────────────────────────────────────────────────
function loadPrompts() {
  chrome.storage.local.get(["prompts"], (res) => {
    allPrompts = res.prompts || [];
    render();
  });
}

// ── Storage write ─────────────────────────────────────────────────────────────
function saveAll(cb) {
  chrome.storage.local.set({ prompts: allPrompts }, cb);
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  renderTagStrip();
  const filtered = filterPrompts();
  renderStats(filtered.length);
  renderList(filtered);
}

function filterPrompts() {
  let list = [...allPrompts];
  // Favorites first
  list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  if (activeTag) {
    list = list.filter((p) => p.tags && p.tags.includes(activeTag));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.text.toLowerCase().includes(q) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }
  return list;
}

function renderStats(count) {
  const total = allPrompts.length;
  if (searchQuery || activeTag) {
    statBar.textContent = `${count} of ${total} prompts`;
  } else {
    statBar.textContent = `${total} prompt${total !== 1 ? "s" : ""}`;
  }
}

function renderTagStrip() {
  const tagCounts = {};
  allPrompts.forEach((p) => {
    (p.tags || []).forEach((t) => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const tags = Object.keys(tagCounts).sort();
  tagStrip.innerHTML = "";

  if (tags.length === 0) return;

  tags.forEach((tag) => {
    const pill = document.createElement("button");
    pill.className = "tag-pill" + (activeTag === tag ? " active" : "");
    pill.textContent = `${tag} ${tagCounts[tag]}`;
    pill.addEventListener("click", () => {
      activeTag = activeTag === tag ? null : tag;
      render();
    });
    tagStrip.appendChild(pill);
  });
}

function renderList(prompts) {
  // Remove existing cards (keep empty state)
  listEl.querySelectorAll(".prompt-card").forEach((el) => el.remove());

  if (prompts.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  const frag = document.createDocumentFragment();
  prompts.forEach((p) => {
    frag.appendChild(createCard(p));
  });
  listEl.appendChild(frag);
}

// ── Card factory ──────────────────────────────────────────────────────────────
function createCard(prompt) {
  const card = document.createElement("div");
  card.className = "prompt-card";
  card.dataset.id = prompt.id;

  // Tags HTML
  const tagsHtml = (prompt.tags || [])
    .map((t) => `<span class="card-tag">${escHtml(t)}</span>`)
    .join("");

  // Preview text
  const preview = prompt.text.replace(/\s+/g, " ").trim();

  card.innerHTML = `
    <div class="card-top">
      <div class="card-title">${escHtml(prompt.title)}</div>
      <button class="card-fav${prompt.favorite ? " active" : ""}" title="${prompt.favorite ? "Unfavorite" : "Favorite"}">
        ${prompt.favorite ? "★" : "☆"}
      </button>
    </div>
    <div class="card-preview">${escHtml(preview)}</div>
    ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ""}
    <div class="card-actions">
      <button class="card-btn delete-btn" title="Delete">Delete</button>
      <button class="card-btn dup-btn" title="Duplicate">Duplicate</button>
      <button class="card-btn insert-btn" title="Insert into active field">Insert</button>
      <button class="card-btn copy-btn" title="Copy to clipboard">Copy</button>
    </div>
  `;

  // ── Events ─────────────────────────────────────────────────────────────────

  // Copy
  card.querySelector(".copy-btn").addEventListener("click", (e) => {
    navigator.clipboard.writeText(prompt.text).then(() => {
      const btn = e.currentTarget;
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1500);
    });
  });

  // Delete
  card.querySelector(".delete-btn").addEventListener("click", () => {
    card.style.opacity = "0.4";
    card.style.transition = "opacity 0.2s";
    setTimeout(() => {
      allPrompts = allPrompts.filter((p) => p.id !== prompt.id);
      saveAll(render);
    }, 180);
  });

  // Favorite
  card.querySelector(".card-fav").addEventListener("click", () => {
    const idx = allPrompts.findIndex((p) => p.id === prompt.id);
    if (idx !== -1) {
      allPrompts[idx].favorite = !allPrompts[idx].favorite;
      saveAll(render);
    }
  });

  // Duplicate
  card.querySelector(".dup-btn").addEventListener("click", () => {
    const idx = allPrompts.findIndex((p) => p.id === prompt.id);
    if (idx !== -1) {
      const copy = {
        ...allPrompts[idx],
        id: Date.now().toString(),
        title: allPrompts[idx].title + " (copy)",
        createdAt: new Date().toISOString(),
        favorite: false,
      };
      allPrompts.splice(idx, 0, copy);
      saveAll(render);
    }
  });

  // Insert into active field
  card.querySelector(".insert-btn").addEventListener("click", () => {
    const text = prompt.text;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (txt) => {
          const el = document.activeElement;
          if (!el) return false;
          const tag = el.tagName.toLowerCase();
          if (tag === "textarea" || (tag === "input" && el.type === "text")) {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, start) + txt + el.value.slice(end);
            el.selectionStart = el.selectionEnd = start + txt.length;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          }
          if (el.isContentEditable) {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(txt));
              range.collapse(false);
            }
            return true;
          }
          return false;
        },
        args: [text],
      });
    });
  });

  return card;
}

// ── Search events ─────────────────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  clearBtn.classList.toggle("visible", searchQuery.length > 0);
  render();
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearBtn.classList.remove("visible");
  render();
});

// ── Export ────────────────────────────────────────────────────────────────────
btnExport.addEventListener("click", () => {
  const json = JSON.stringify({ version: 1, prompts: allPrompts }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `promptvault-backup-${dateStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Import ────────────────────────────────────────────────────────────────────
btnImport.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const imported = data.prompts || (Array.isArray(data) ? data : []);
      if (!imported.length) return alert("No prompts found in file.");
      // Merge: add prompts that don't already exist (by id)
      const existingIds = new Set(allPrompts.map((p) => p.id));
      const newOnes = imported.filter((p) => !existingIds.has(p.id));
      allPrompts = [...newOnes, ...allPrompts];
      saveAll(() => {
        importFile.value = "";
        render();
      });
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Storage change listener (live updates if multiple popups) ─────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.prompts) {
    allPrompts = changes.prompts.newValue || [];
    render();
  }
});
