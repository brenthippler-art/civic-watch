// Collapsible sections. Markup:
//   <h2><button class="section-toggle" aria-expanded="false" aria-controls="panel-id">…</button></h2>
//   <div id="panel-id" class="section-panel" hidden>…</div>

// Opens or closes one section.
export function setOpen(button, open) {
  if (!button) return;
  button.setAttribute("aria-expanded", String(open));
  document.getElementById(button.getAttribute("aria-controls")).hidden = !open;
}

// Opens whichever section contains this element (used by shared meeting links).
export function openSectionContaining(element) {
  const panel = element.closest(".section-panel");
  if (panel) setOpen(document.querySelector(`[aria-controls="${panel.id}"]`), true);
}

// One click handler for every toggle on the page, including ones added later.
document.addEventListener("click", (event) => {
  const button = event.target.closest(".section-toggle");
  if (!button) return;
  setOpen(button, button.getAttribute("aria-expanded") !== "true");
});