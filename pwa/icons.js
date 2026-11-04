// Small stroke icons (24x24 grid, 1.6 stroke). Inserted into any element with data-icon="name".
const PATHS = {
  speaker: '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18.2 6.5a7.6 7.6 0 0 1 0 11"/>',
  "chevron-left": '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  "chevron-right": '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  "chevron-down": '<path d="M6 9.5 12 15.5l6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
};

export function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

export function iconEl(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = iconSvg(name);
  return span;
}

export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    el.classList.add("icon");
    el.innerHTML = iconSvg(el.dataset.icon);
  }
}
