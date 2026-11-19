import { SIDEBAR_KEY } from "@/lib/ui/sidebar";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "research-marshal.theme";
export const PANEL_KEY = "research-marshal.panel";

// Runs in <head> before the first paint, so a reload never flashes the wrong theme or
// the wrong panel width, or the wide sidebar for a collapsed one. Storage can throw in a private window; the defaults then stand.
export const BEFORE_PAINT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark")}catch(e){}try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PANEL_KEY)})||"{}");if(p.open===false)d.dataset.panel="closed";if(typeof p.width==="number")d.style.setProperty("--panel-width",p.width+"px")}catch(e){}try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==="collapsed")d.dataset.sidebar="collapsed"}catch(e){}})()`;

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}
