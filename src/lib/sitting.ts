export type Thought = {
  id: string
  text: string
  offsetMs: number
}

export type PomoPhase = "focus" | "short" | "long"

export type PomodoroSettings = {
  focus: number
  shortBreak: number
  longBreak: number
  rounds: number
}

export type PomodoroRun = {
  phase: PomoPhase
  phaseEndsAt: number
  phaseMinutes: number
  completedFocuses: number
}

export type SittingPlan = "25" | "open" | "pomo"

export type Sitting = {
  id: string
  startedAt: number
  endedAt: number | null
  revealedAt: number | null
  targetMinutes: number | null
  pomodoro: PomodoroRun | null
  thoughts: Thought[]
  draft: string
}

export type Theme = "ink" | "paper"

export type Store = {
  theme: Theme
  plan: SittingPlan
  pomodoro: PomodoroSettings
  active: Sitting | null
  archive: Sitting[]
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  rounds: 4,
}

const POMO_LIMITS: Record<keyof PomodoroSettings, [number, number]> = {
  focus: [1, 180],
  shortBreak: [1, 60],
  longBreak: [1, 120],
  rounds: [1, 12],
}

export const MAX_THOUGHT = 4000
export const MAX_ARCHIVE = 40

export function clampPomodoro(value: unknown): PomodoroSettings {
  const source = isRecord(value) ? value : {}
  const pick = (key: keyof PomodoroSettings) => {
    const [min, max] = POMO_LIMITS[key]
    const raw = source[key]
    const parsed = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_POMODORO[key]
    return Math.min(max, Math.max(min, parsed))
  }
  return {
    focus: pick("focus"),
    shortBreak: pick("shortBreak"),
    longBreak: pick("longBreak"),
    rounds: pick("rounds"),
  }
}

function phaseMinutes(phase: PomoPhase, settings: PomodoroSettings) {
  if (phase === "focus") return settings.focus
  if (phase === "long") return settings.longBreak
  return settings.shortBreak
}

export function startPomodoro(settings: PomodoroSettings, now: number): PomodoroRun {
  const minutes = settings.focus
  return {
    phase: "focus",
    phaseMinutes: minutes,
    phaseEndsAt: now + minutes * 60_000,
    completedFocuses: 0,
  }
}

export function advancePomodoro(run: PomodoroRun, settings: PomodoroSettings, now: number): PomodoroRun {
  if (run.phase === "focus") {
    const completedFocuses = run.completedFocuses + 1
    const phase: PomoPhase = completedFocuses % settings.rounds === 0 ? "long" : "short"
    const minutes = phaseMinutes(phase, settings)
    return { phase, phaseMinutes: minutes, phaseEndsAt: now + minutes * 60_000, completedFocuses }
  }
  const minutes = settings.focus
  return {
    phase: "focus",
    phaseMinutes: minutes,
    phaseEndsAt: now + minutes * 60_000,
    completedFocuses: run.completedFocuses,
  }
}

export function createSitting(targetMinutes: number | null, now: number, pomo?: PomodoroSettings): Sitting {
  const settings = pomo ? clampPomodoro(pomo) : null
  return {
    id: crypto.randomUUID(),
    startedAt: now,
    endedAt: null,
    revealedAt: null,
    targetMinutes: settings ? null : targetMinutes,
    pomodoro: settings ? startPomodoro(settings, now) : null,
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
  return sitting.thoughts.map((thought) => thought.text.trim()).filter(Boolean).join("\n")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function sanitizePomodoro(value: unknown): PomodoroRun | null {
  if (!isRecord(value)) return null
  if (value.phase !== "focus" && value.phase !== "short" && value.phase !== "long") return null
  if (typeof value.phaseEndsAt !== "number" || !Number.isFinite(value.phaseEndsAt)) return null
  if (typeof value.phaseMinutes !== "number" || !Number.isFinite(value.phaseMinutes)) return null
  if (typeof value.completedFocuses !== "number" || !Number.isFinite(value.completedFocuses)) return null
  return {
    phase: value.phase,
    phaseEndsAt: value.phaseEndsAt,
    phaseMinutes: Math.max(1, Math.round(value.phaseMinutes)),
    completedFocuses: Math.max(0, Math.round(value.completedFocuses)),
  }
}

const PLANS: SittingPlan[] = ["25", "open", "pomo"]

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
    pomodoro: sanitizePomodoro(value.pomodoro),
    thoughts,
    draft: typeof value.draft === "string" ? value.draft : "",
  }
}

export function sanitizeStore(value: unknown, theme: Theme): Store {
  if (!isRecord(value)) {
    return { theme, plan: "25", pomodoro: DEFAULT_POMODORO, active: null, archive: [] }
  }
  const storedTheme: Theme = value.theme === "paper" || value.theme === "ink" ? value.theme : theme
  const plan: SittingPlan = PLANS.includes(value.plan as SittingPlan) ? (value.plan as SittingPlan) : "25"
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
    plan,
    pomodoro: clampPomodoro(value.pomodoro),
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
