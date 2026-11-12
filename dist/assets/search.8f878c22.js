"use strict";

let searchAdapterPromise;

function loadSearchAdapter() {
  if (!searchAdapterPromise) {
    searchAdapterPromise = import("/_zeropress/search.js").catch((error) => {
      searchAdapterPromise = null;
      throw error;
    });
  }
  return searchAdapterPromise;
}

function initSearch() {
  const dialog = document.querySelector("[data-search-dialog]");
  const opener = document.querySelector("[data-search-open]");
  if (!(dialog instanceof HTMLDialogElement) || !(opener instanceof HTMLButtonElement)
      || typeof dialog.showModal !== "function" || dialog.dataset.ready === "true") return;
  const input = dialog.querySelector("[data-search-input]");
  const list = dialog.querySelector("[data-search-results]");
  const status = dialog.querySelector("[data-search-status]");
  const retry = dialog.querySelector("[data-search-retry]");
  const close = dialog.querySelector("[data-search-close]");
  if (!input || !list || !status || !retry || !close) return;
  dialog.dataset.ready = "true";

  let ticket = 0;
  let timer;
  let composing = false;
  let previousFocus;
  let backdropPointer = false;

  function cancelSearch() {
    ticket += 1;
    window.clearTimeout(timer);
    list.setAttribute("aria-busy", "false");
  }

  function resultUrl(value) {
    try {
      if (typeof value !== "string" || !value.trim()) return null;
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  function excerpt(row) {
    if (typeof row.plain_excerpt === "string") return row.plain_excerpt;
    // Pagefind excerpts contain markup. Parse it inertly and render only text.
    const template = document.createElement("template");
    template.innerHTML = typeof row.excerpt === "string" ? row.excerpt : "";
    return template.content.textContent.trim();
  }

  async function search(query, currentTicket) {
    try {
      const adapter = await loadSearchAdapter();
      const response = await adapter.search(query, { limit: 8 });
      const rows = await Promise.all((response?.results || []).map((result) => result.data()));
      if (currentTicket !== ticket || !dialog.open) return;
      for (const row of rows) {
        const url = resultUrl(row?.url);
        if (!url) continue;
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.className = "search-result";
        link.href = url;
        const title = document.createElement("span");
        title.className = "search-result__title";
        title.textContent = row.meta?.title || url;
        link.append(title);
        const summary = excerpt(row);
        if (summary) {
          const description = document.createElement("span");
          description.className = "search-result__excerpt";
          description.textContent = summary;
          link.append(description);
        }
        item.append(link);
        list.append(item);
      }
      const count = list.children.length;
      status.textContent = count ? `${count} ${count === 1 ? "result" : "results"}.` : "No matches.";
    } catch {
      if (currentTicket !== ticket || !dialog.open) return;
      list.replaceChildren();
      status.textContent = "Search is unavailable. Reload the page to try again.";
      retry.hidden = false;
    } finally {
      if (currentTicket === ticket) list.setAttribute("aria-busy", "false");
    }
  }

  function scheduleSearch() {
    cancelSearch();
    list.replaceChildren();
    retry.hidden = true;
    const query = input.value.trim();
    if (!query || composing) {
      status.textContent = "Type to search.";
      return;
    }
    status.textContent = "Searching…";
    list.setAttribute("aria-busy", "true");
    const currentTicket = ticket;
    timer = window.setTimeout(() => search(query, currentTicket), 150);
  }

  function openSearch() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    input.value = "";
    composing = false;
    scheduleSearch();
    dialog.showModal();
    document.documentElement.classList.add("search-is-open");
    input.focus();
  }

  opener.disabled = false;
  opener.addEventListener("click", openSearch);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (composing) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    cancelSearch();
    document.documentElement.classList.remove("search-is-open");
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  });

  const outsideDialog = (event) => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  dialog.addEventListener("pointerdown", (event) => { backdropPointer = outsideDialog(event); });
  dialog.addEventListener("click", (event) => {
    if (backdropPointer && outsideDialog(event)) dialog.close();
    backdropPointer = false;
  });

  input.addEventListener("input", scheduleSearch);
  input.addEventListener("compositionstart", () => { composing = true; scheduleSearch(); });
  input.addEventListener("compositionend", () => { composing = false; scheduleSearch(); });
  retry.addEventListener("click", () => window.location.reload());

  dialog.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || composing) return;
    const links = [...list.querySelectorAll("a")];
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), [tabindex]")]
        .filter((element) => element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.key === "Enter" && event.target === input && links.length) {
      event.preventDefault();
      links[0].click();
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && links.length) {
      const index = links.indexOf(document.activeElement);
      if (event.target !== input && index < 0) return;
      event.preventDefault();
      const next = index < 0 ? (event.key === "ArrowDown" ? links[0] : links.at(-1))
        : links[index + (event.key === "ArrowDown" ? 1 : -1)] || input;
      next.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || composing
        || document.querySelector("dialog[open]:not([data-search-dialog])")) return;
    const target = event.target;
    const editable = target instanceof HTMLElement && (target.isContentEditable
      || target.matches("input, textarea, select") || target.closest("[contenteditable]:not([contenteditable='false'])"));
    if (editable && !dialog.open) return;
    const shortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k";
    const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !editable;
    if (shortcut || (slash && !dialog.open)) {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else openSearch();
    }
  });
}

initSearch();
