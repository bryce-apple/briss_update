/**
 * Briss Web entry point. The app is two independent tools sharing one page:
 *   • Crop     — Briss-style overlay cropping (with page splitting).
 *   • Organize — delete, reorder and rotate individual pages.
 * A tab switches between them; each tool loads its own PDF and exports its own
 * result. No backend, no upload — everything runs in the browser.
 */
import "./styles.css";
import { createCropMode } from "./modes/cropMode";
import { createOrganizeMode } from "./modes/organizeMode";

const main = document.getElementById("main") as HTMLElement;
const tabs = document.getElementById("tabs") as HTMLElement;

const views: Record<string, HTMLElement> = {
  crop: createCropMode(),
  organize: createOrganizeMode(),
};
for (const view of Object.values(views)) main.appendChild(view);

function activate(name: string): void {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  for (const btn of tabs.querySelectorAll<HTMLButtonElement>(".tab")) {
    btn.classList.toggle("active", btn.dataset.tab === name);
  }
}

tabs.addEventListener("click", (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab");
  if (tab?.dataset.tab) activate(tab.dataset.tab);
});

activate("crop");
