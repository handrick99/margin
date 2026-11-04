import { sanitizeStore, type Store, type Theme } from "@/lib/sitting"

export const STORE_KEY = "margin.v1"
export const THEME_KEY = "margin.theme"

export function loadStore(): { store: Store; persistent: boolean } {
  try {
    const theme: Theme = localStorage.getItem(THEME_KEY) === "paper" ? "paper" : "ink"
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { store: { theme, active: null, archive: [] }, persistent: true }
    return { store: sanitizeStore(JSON.parse(raw) as unknown, theme), persistent: true }
  } catch {
    return { store: { theme: "ink", active: null, archive: [] }, persistent: false }
  }
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
