import { parseStore, type Store, type Theme } from "./sitting"

export const STORE_KEY = "margin.v1"
export const THEME_KEY = "margin.theme"

export function loadStore(): { store: Store; persistent: boolean } {
  let theme: Theme = "ink"
  let raw: string | null = null
  try {
    theme = localStorage.getItem(THEME_KEY) === "paper" ? "paper" : "ink"
    raw = localStorage.getItem(STORE_KEY)
  } catch {
    return { store: { theme: "ink", active: null, archive: [] }, persistent: false }
  }
  if (!raw) return { store: { theme, active: null, archive: [] }, persistent: true }
  return { store: parseStore(raw, theme), persistent: true }
}

export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
    localStorage.setItem(THEME_KEY, store.theme)
    return true
  } catch {
    return false
  }
}
