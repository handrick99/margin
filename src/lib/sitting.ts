export type Thought = {
  id: string
  text: string
  offsetMs: number
}

export type Sitting = {
  id: string
  startedAt: number
  endedAt: number | null
  revealedAt: number | null
  targetMinutes: number | null
  thoughts: Thought[]
  draft: string
}

export type Theme = "ink" | "paper"

export type Store = {
  theme: Theme
  active: Sitting | null
  archive: Sitting[]
}

export const MAX_THOUGHT = 4000
export const MAX_ARCHIVE = 40

export function createSitting(targetMinutes: number | null, now: number): Sitting {
  return {
    id: crypto.randomUUID(),
    startedAt: now,
    endedAt: null,
    revealedAt: null,
    targetMinutes,
    thoughts: [],
    draft: "",
  }
}

export type ParkResult =
  | { ok: true; sitting: Sitting }
  | { ok: false; reason: "empty" | "long" }

export function parkThought(sitting: Sitting, text: string, now: number): ParkResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, reason: "empty" }
  if (trimmed.length > MAX_THOUGHT) return { ok: false, reason: "long" }
  return {
    ok: true,
    sitting: {
      ...sitting,
      draft: "",
      thoughts: [
        ...sitting.thoughts,
        {
          id: crypto.randomUUID(),
          text: trimmed,
          offsetMs: Math.max(0, now - sitting.startedAt),
        },
      ],
    },
  }
}

export function seal(sitting: Sitting, now: number): Sitting {
  return { ...sitting, endedAt: now, draft: "" }
}

export function resume(sitting: Sitting): Sitting {
  return { ...sitting, endedAt: null, revealedAt: null }
}

export function reveal(sitting: Sitting, now: number): Sitting {
  return { ...sitting, revealedAt: sitting.revealedAt ?? now }
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => value.toString().padStart(2, "0")
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

export function formatLength(ms: number): string {
  if (ms < 30_000) return "under a minute"
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatWhen(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ts))
}

export function sittingLength(sitting: Sitting, now: number): number {
  return Math.max(0, (sitting.endedAt ?? now) - sitting.startedAt)
}

export function transcript(sitting: Sitting): string {
  const length = formatLength(sittingLength(sitting, sitting.endedAt ?? sitting.startedAt))
  const when = formatWhen(sitting.startedAt)
  const body = sitting.thoughts.length
    ? sitting.thoughts
        .map((thought) => `${formatElapsed(thought.offsetMs)}\n${thought.text}`)
        .join("\n\n")
    : "Nothing wandered in."
  return `Margin · ${when} · ${length}\n\n${body}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function sanitizeThought(value: unknown): Thought | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== "string" || typeof value.text !== "string") return null
  if (typeof value.offsetMs !== "number" || !Number.isFinite(value.offsetMs)) return null
  return { id: value.id, text: value.text, offsetMs: Math.max(0, value.offsetMs) }
}

export function sanitizeSitting(value: unknown): Sitting | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== "string" || typeof value.startedAt !== "number") return null
  const thoughts = Array.isArray(value.thoughts)
    ? value.thoughts.flatMap((thought) => {
        const clean = sanitizeThought(thought)
        return clean ? [clean] : []
      })
    : []
  return {
    id: value.id,
    startedAt: value.startedAt,
    endedAt: typeof value.endedAt === "number" ? value.endedAt : null,
    revealedAt: typeof value.revealedAt === "number" ? value.revealedAt : null,
    targetMinutes: typeof value.targetMinutes === "number" ? value.targetMinutes : null,
    thoughts,
    draft: typeof value.draft === "string" ? value.draft : "",
  }
}

export function sanitizeStore(value: unknown, theme: Theme): Store {
  if (!isRecord(value)) return { theme, active: null, archive: [] }
  const storedTheme: Theme = value.theme === "paper" || value.theme === "ink" ? value.theme : theme
  const archive = Array.isArray(value.archive)
    ? value.archive
        .flatMap((sitting) => {
          const clean = sanitizeSitting(sitting)
          return clean ? [clean] : []
        })
        .slice(0, MAX_ARCHIVE)
    : []
  return {
    theme: storedTheme,
    active: sanitizeSitting(value.active),
    archive,
  }
}

export function archiveSitting(store: Store, sitting: Sitting): Store {
  return {
    ...store,
    active: store.active?.id === sitting.id ? null : store.active,
    archive: [sitting, ...store.archive.filter((item) => item.id !== sitting.id)].slice(0, MAX_ARCHIVE),
  }
}
