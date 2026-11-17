"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  advancePomodoro,
  archiveSitting,
  clampPomodoro,
  createSitting,
  formatElapsed,
  formatLength,
  formatWhen,
  parkThought,
  reveal,
  resume,
  seal,
  sittingLength,
  transcript,
  type PomodoroSettings,
  type Sitting,
  type SittingPlan,
  type Store,
  type Theme,
} from "@/lib/sitting"
import { loadStore, saveStore } from "@/lib/storage"

const PLANS: { id: SittingPlan; label: string }[] = [
  { id: "25", label: "25 min" },
  { id: "open", label: "Open" },
  { id: "pomo", label: "Pomo" },
]

const POMO_FIELDS: { key: keyof PomodoroSettings; label: string; suffix: string }[] = [
  { key: "focus", label: "Focus", suffix: "min" },
  { key: "shortBreak", label: "Break", suffix: "min" },
  { key: "longBreak", label: "Long", suffix: "min" },
  { key: "rounds", label: "Long every", suffix: "" },
]

type Phase = "loading" | "idle" | "live" | "sealed" | "open"

function phaseOf(store: Store | null, viewing: Sitting | null): Phase {
  if (!store) return "loading"
  if (viewing) return "open"
  if (!store.active) return "idle"
  if (store.active.revealedAt) return "open"
  if (store.active.endedAt) return "sealed"
  return "live"
}

function themeColor(theme: Theme) {
  return theme === "ink" ? "#141414" : "#e8e8e6"
}

function chime(ctx: AudioContext | null) {
  if (!ctx) return
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
  gain.connect(ctx.destination)
  const tone = ctx.createOscillator()
  tone.type = "sine"
  tone.frequency.setValueAtTime(523.25, now)
  tone.frequency.setValueAtTime(659.25, now + 0.12)
  tone.connect(gain)
  tone.start(now)
  tone.stop(now + 0.46)
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "ink")
  const color = themeColor(theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color)
  window.margin?.setBackground(color)
}

export function MarginWidget() {
  const [store, setStore] = useState<Store | null>(null)
  const [persistent, setPersistent] = useState(true)
  const [draft, setDraft] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const [justHeld, setJustHeld] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [viewing, setViewing] = useState<Sitting | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const draftRef = useRef("")
  const storeRef = useRef<Store | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const revealRef = useRef<HTMLButtonElement>(null)
  const beginRef = useRef<() => void>(() => {})
  const endRef = useRef<() => void>(() => {})
  const resumeRef = useRef<() => void>(() => {})
  const copyRef = useRef<() => void>(() => {})
  const audioRef = useRef<AudioContext | null>(null)

  storeRef.current = store
  const phase = phaseOf(store, viewing)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const openSitting = viewing ?? (store?.active?.revealedAt ? store.active : null)

  useLayoutEffect(() => {
    const on = window.location.search.includes("desktop=1") || typeof window.margin !== "undefined"
    document.documentElement.classList.toggle("desktop", on)
    setDesktop(on)
  }, [])

  useEffect(() => {
    const margin = window.margin
    if (!margin?.isFullscreen) return
    let cancelled = false
    margin.isFullscreen().then((value) => {
      if (!cancelled) setFullscreen(value)
    })
    const unsubscribe = margin.onFullscreen((value) => {
      if (!cancelled) setFullscreen(value)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("fullscreen", fullscreen)
  }, [fullscreen])

  useEffect(() => {
    const loaded = loadStore()
    setStore(loaded.store)
    setPersistent(loaded.persistent)
    draftRef.current = loaded.store.active?.draft ?? ""
    setDraft(loaded.store.active?.draft ?? "")
    applyTheme(loaded.store.theme)
  }, [])

  useEffect(() => {
    if (phase !== "live") {
      document.title = "Margin"
      return
    }
    const tick = () => {
      const time = Date.now()
      setNow(time)
      const current = storeRef.current
      const sitting = current?.active
      const run = sitting?.pomodoro
      if (!current || !sitting || sitting.endedAt || !run || time < run.phaseEndsAt) return
      const nextRun = advancePomodoro(run, current.pomodoro, time)
      chime(audioRef.current)
      const next = { ...current, active: { ...sitting, pomodoro: nextRun } }
      storeRef.current = next
      setStore(next)
      setPersistent(saveStore(next))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      document.title = "Margin"
    }
  }, [phase])

  useEffect(() => {
    const sitting = store?.active
    const cycle = sitting?.pomodoro
    if (phase !== "live" || !sitting || sitting.endedAt || !cycle) return
    const label = cycle.phase === "focus" ? "Focus" : "Break"
    document.title = `${formatElapsed(Math.max(0, cycle.phaseEndsAt - now))} ${label} · Margin`
  }, [phase, store, now])

  useEffect(() => {
    if (phase === "live") inputRef.current?.focus()
    if (phase === "sealed") revealRef.current?.focus()
  }, [phase])

  useEffect(() => {
    if (!store) return
    const id = window.setTimeout(() => {
      const current = storeRef.current
      if (!current?.active || current.active.endedAt) return
      if (current.active.draft === draft) return
      const next = { ...current, active: { ...current.active, draft } }
      storeRef.current = next
      setStore(next)
      setPersistent(saveStore(next))
    }, 250)
    return () => window.clearTimeout(id)
  }, [draft, store])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "f" || event.key === "F") && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target
        const typing =
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        if (!typing) {
          event.preventDefault()
          window.margin?.toggleFullscreen()
        }
        return
      }
      if ((event.key === "c" || event.key === "C") && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target
        const typing =
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        if (!typing && phaseRef.current === "open") {
          event.preventDefault()
          copyRef.current()
        }
        return
      }
      if (event.code !== "Space" || event.repeat || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
      const screen = phaseRef.current
      if (screen !== "idle" && screen !== "live" && screen !== "sealed") return
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (typing) {
        const emptyThought = screen === "live" && target === inputRef.current && draftRef.current === ""
        if (!emptyThought) return
      }
      event.preventDefault()
      if (screen === "idle") beginRef.current()
      else if (screen === "live") endRef.current()
      else resumeRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!justHeld) return
    const id = window.setTimeout(() => setJustHeld(false), 900)
    return () => window.clearTimeout(id)
  }, [justHeld])

  function persist(next: Store) {
    storeRef.current = next
    setStore(next)
    setPersistent(saveStore(next))
  }

  function switchTheme() {
    if (!store) return
    const theme: Theme = store.theme === "ink" ? "paper" : "ink"
    applyTheme(theme)
    persist({ ...store, theme })
  }

  function ensureAudio() {
    const Ctx = window.AudioContext
    if (!Ctx) return null
    if (!audioRef.current) audioRef.current = new Ctx()
    void audioRef.current.resume()
    return audioRef.current
  }

  function begin() {
    if (!store) return
    ensureAudio()
    setViewing(null)
    setNotice(null)
    setConfirmClear(false)
    draftRef.current = ""
    setDraft("")
    const minutes = store.plan === "25" ? 25 : null
    persist({
      ...store,
      active: createSitting(minutes, Date.now(), store.plan === "pomo" ? store.pomodoro : undefined),
    })
  }

  beginRef.current = begin
  endRef.current = endSitting
  resumeRef.current = onResume

  function choosePlan(plan: SittingPlan) {
    if (!store || store.plan === plan) return
    persist({ ...store, plan })
  }

  function setPomo(key: keyof PomodoroSettings, raw: number) {
    if (!store) return
    persist({ ...store, pomodoro: clampPomodoro({ ...store.pomodoro, [key]: raw }) })
  }

  function skipPhase() {
    const current = storeRef.current
    const sitting = current?.active
    if (!current || !sitting?.pomodoro || sitting.endedAt) return
    const nextRun = advancePomodoro(sitting.pomodoro, current.pomodoro, Date.now())
    persist({ ...current, active: { ...sitting, pomodoro: nextRun } })
  }

  function parkCurrent() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt) return
    const result = parkThought(current.active, draftRef.current, Date.now())
    if (!result.ok) {
      if (result.reason === "long") setNotice("Too long to hold. Shorten it a little.")
      return
    }
    draftRef.current = ""
    setDraft("")
    setNotice(null)
    setJustHeld(true)
    persist({ ...current, active: result.sitting })
  }

  function endSitting() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt) return
    let active = current.active
    const pending = draftRef.current.trim()
    if (pending) {
      const result = parkThought(active, pending, Date.now())
      if (!result.ok && result.reason === "long") {
        setNotice("That line is too long to hold. Shorten it, or clear it, then end.")
        return
      }
      if (result.ok) active = result.sitting
    }
    draftRef.current = ""
    setDraft("")
    setNotice(null)
    persist({ ...current, active: seal(active, Date.now()) })
  }

  function onReveal() {
    const current = storeRef.current
    if (!current?.active) return
    setNotice(null)
    persist({ ...current, active: reveal(current.active, Date.now()) })
  }

  function onResume() {
    const current = storeRef.current
    if (!current?.active) return
    setNotice(null)
    persist({ ...current, active: resume(current.active) })
  }

  function finish() {
    const current = storeRef.current
    if (!current?.active) return
    setViewing(null)
    setConfirmClear(false)
    setCopied(false)
    setNotice(null)
    persist(archiveSitting(current, current.active))
  }

  function discard() {
    const current = storeRef.current
    if (!current) return
    if (viewing) {
      persist({
        ...current,
        archive: current.archive.filter((item) => item.id !== viewing.id),
      })
      setViewing(null)
    } else if (current.active) {
      persist({ ...current, active: null })
    }
    setConfirmClear(false)
    setCopied(false)
    setNotice(null)
  }

  async function copyAll(sitting: Sitting) {
    try {
      await navigator.clipboard.writeText(transcript(sitting))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setNotice("Couldn’t copy. Select the thoughts instead.")
    }
  }

  copyRef.current = () => {
    if (openSitting) void copyAll(openSitting)
  }

  const active = store?.active ?? null
  const elapsed = active ? sittingLength(active, now) : 0
  const run = active?.pomodoro ?? null
  const targetMs = !run && active?.targetMinutes ? active.targetMinutes * 60_000 : null
  const blockDone = phase === "live" && targetMs !== null && elapsed >= targetMs
  const remaining = run ? Math.max(0, run.phaseEndsAt - now) : 0
  const pomoTotal = run ? run.phaseMinutes * 60_000 : 0
  const progress = run
    ? pomoTotal ? Math.min(100, ((pomoTotal - remaining) / pomoTotal) * 100) : 0
    : targetMs ? Math.min(100, (elapsed / targetMs) * 100) : 0
  const phaseLabel = run?.phase === "focus" ? "Focus" : run?.phase === "long" ? "Long break" : run ? "Break" : blockDone ? "Block finished" : "Studying"
  const phaseAside = run
    ? run.phase === "focus"
      ? `${(run.completedFocuses % (store?.pomodoro.rounds || 4)) + 1} of ${store?.pomodoro.rounds || 4}`
      : "then focus"
    : active?.targetMinutes
      ? `${active.targetMinutes} min`
      : "Open"

  return (
    <main className="desk flex min-h-dvh items-start justify-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10 sm:items-center">
      <section
        className="margin-widget flex w-[min(100%,24rem)] flex-col px-5 pb-5 sm:px-6 sm:pb-6"
        aria-labelledby="margin-title"
        aria-busy={phase === "loading"}
        data-phase={phase}
      >
        <header className="drag -mx-5 mb-8 flex items-center justify-between gap-3 px-5 pt-5 sm:-mx-6 sm:px-6 sm:pt-6">
          <h1 id="margin-title" className="text-[11px] font-medium tracking-[0.28em]">
            MARGIN
          </h1>
          <div className="flex items-center gap-0.5">
            {store ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={switchTheme}
                aria-label={store.theme === "ink" ? "Switch to paper" : "Switch to ink"}
              >
                {store.theme === "ink" ? "Paper" : "Ink"}
              </Button>
            ) : null}
            {desktop ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => window.margin?.toggleFullscreen()}
              >
                {fullscreen ? "Window" : "Full screen"}
              </Button>
            ) : null}
            {desktop ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => window.margin?.close()}
              >
                Close
              </Button>
            ) : null}
          </div>
        </header>

        <div className="margin-body">
        {phase === "loading" ? <Loading /> : null}

        {phase === "idle" && store ? (
          <div className="space-y-7">
            <div className="space-y-2">
              <p className="text-[1.65rem] font-medium leading-snug tracking-[-0.02em]">
                Park what interrupts you.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Thoughts stay closed until you end the sitting and ask to see them.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Sitting length">
              {PLANS.map((option) => {
                const selected = store.plan === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choosePlan(option.id)}
                    className={`rounded-sm py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
                      selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={selected ? "border-b border-foreground pb-px" : undefined}>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
            {store.plan === "pomo" ? (
              <div className="space-y-2.5">
                {POMO_FIELDS.map((field) => (
                  <PomoField
                    key={field.key}
                    label={field.label}
                    suffix={field.suffix}
                    value={store.pomodoro[field.key]}
                    onCommit={(value) => setPomo(field.key, value)}
                  />
                ))}
              </div>
            ) : null}
            <Button type="button" className="h-10 w-full" onClick={begin}>
              Begin sitting
            </Button>
            {store.archive.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                  Earlier
                </p>
                <ul className="max-h-48 overflow-y-auto">
                  {store.archive.map((sitting) => (
                    <li key={sitting.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left text-sm"
                        onClick={() => {
                          setNotice(null)
                          setConfirmClear(false)
                          setViewing(sitting)
                        }}
                      >
                        <span>{formatWhen(sitting.startedAt)}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatLength(sittingLength(sitting, sitting.endedAt ?? sitting.startedAt))}
                          {" · "}
                          {sitting.thoughts.length}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === "live" && active ? (
          <div>
            <div className="mb-6 flex items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <span className="breathe inline-block size-1.5 rounded-full bg-foreground" aria-hidden />
                  {phaseLabel}
                </p>
                <p className="mt-1 text-[2.75rem] leading-none font-medium tabular-nums tracking-[-0.045em]">
                  {formatElapsed(run ? remaining : elapsed)}
                </p>
              </div>
              <p className="pb-1 text-sm text-muted-foreground">{phaseAside}</p>
            </div>
            {targetMs || run ? (
              <div className="mb-6 h-px w-full bg-foreground/15" aria-hidden>
                <div className="h-px bg-foreground" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            {blockDone ? (
              <p className="mb-4 text-sm text-muted-foreground">The block is finished. Stay, or end it.</p>
            ) : null}
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                draftRef.current = event.target.value
                setDraft(event.target.value)
                if (notice) setNotice(null)
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                parkCurrent()
              }}
              placeholder="A thought, then return"
              aria-label="Thought to park"
              rows={2}
              maxLength={4200}
              autoComplete="off"
              spellCheck
              className="min-h-14 resize-none rounded-none border-0 border-b border-foreground/15 bg-transparent px-0 py-2 text-base leading-relaxed tracking-[0.01em] shadow-none focus-visible:border-foreground/45 focus-visible:ring-0 md:text-base dark:bg-transparent"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>Return parks it. It stays hidden.</p>
              {draft.length > 3600 ? <p className="tabular-nums">{4000 - draft.trim().length}</p> : null}
            </div>
            {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-sm tabular-nums" aria-live="polite">
                {justHeld ? (
                  <span>Held</span>
                ) : active.thoughts.length === 0 ? (
                  <span className="text-muted-foreground">Nothing held yet</span>
                ) : (
                  <span>
                    {active.thoughts.length} held
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                {run ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={skipPhase}
                  >
                    Skip
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-2 font-normal hover:bg-transparent hover:text-foreground"
                  onClick={endSitting}
                >
                  End sitting
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "sealed" && active ? (
          <div>
            <p className="text-sm text-muted-foreground">Sitting closed</p>
            <p className="mt-2 text-[2.75rem] leading-none font-medium tabular-nums tracking-[-0.045em]">
              {formatElapsed(elapsed)}
            </p>
            <p className="mt-4 text-xl font-medium leading-snug tracking-[0.04em]">
              {active.thoughts.length === 0
                ? "Nothing was held."
                : `${active.thoughts.length} still put away.`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">They stay closed until you reveal them.</p>
            {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" className="h-11" ref={revealRef} onClick={onReveal}>
                Reveal
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={onResume}
              >
                Resume
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "open" && openSitting ? (
          <Reveal
            sitting={openSitting}
            fromArchive={viewing !== null}
            copied={copied}
            confirmClear={confirmClear}
            notice={notice}
            onCopy={() => copyAll(openSitting)}
            onDone={viewing ? () => setViewing(null) : finish}
            onAskClear={() => setConfirmClear(true)}
            onCancelClear={() => setConfirmClear(false)}
            onDiscard={discard}
          />
        ) : null}

        {!persistent && phase !== "loading" ? (
          <p className="mt-5 text-xs text-muted-foreground">This sitting stays in this tab only.</p>
        ) : null}
        </div>
      </section>
    </main>
  )
}

function PomoField({
  label,
  suffix,
  value,
  onCommit,
}: {
  label: string
  suffix: string
  value: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <label className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <input
          value={text}
          inputMode="numeric"
          aria-label={label}
          onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 3))}
          onBlur={() => {
            const parsed = Number.parseInt(text, 10)
            onCommit(Number.isFinite(parsed) ? parsed : value)
          }}
          className="w-8 border-b border-transparent bg-transparent text-right tabular-nums outline-none focus:border-foreground"
        />
        <span className="w-6 text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  )
}

function Loading() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-7 w-40 rounded-md bg-muted" />
      <div className="h-4 w-full rounded-md bg-muted" />
      <div className="h-11 w-full rounded-xl bg-muted" />
    </div>
  )
}

function Reveal({
  sitting,
  fromArchive,
  copied,
  confirmClear,
  notice,
  onCopy,
  onDone,
  onAskClear,
  onCancelClear,
  onDiscard,
}: {
  sitting: Sitting
  fromArchive: boolean
  copied: boolean
  confirmClear: boolean
  notice: string | null
  onCopy: () => void
  onDone: () => void
  onAskClear: () => void
  onCancelClear: () => void
  onDiscard: () => void
}) {
  const length = formatLength(sittingLength(sitting, sitting.endedAt ?? sitting.startedAt))
  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">After</p>
          <p className="mt-1 text-[1.65rem] font-medium leading-none tracking-[-0.02em]">{length}</p>
        </div>
        <p className="pb-1 text-sm text-muted-foreground tabular-nums">
          {formatWhen(sitting.startedAt)}
          {" · "}
          {sitting.thoughts.length}
        </p>
      </div>
      {sitting.thoughts.length === 0 ? (
        <p className="text-xl font-medium tracking-[0.04em]">Nothing wandered in.</p>
      ) : (
        <ul className="max-h-[min(52vh,28rem)] space-y-5 overflow-y-auto pr-1">
          {sitting.thoughts.map((thought, index) => (
            <li
              key={thought.id}
              className="thought-row"
              style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
            >
              <p className="text-xs tracking-[0.14em] text-muted-foreground tabular-nums">
                {formatElapsed(thought.offsetMs)}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed tracking-[0.01em] whitespace-pre-wrap">
                {thought.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {notice ? <p className="mt-4 text-sm">{notice}</p> : null}
      {confirmClear ? (
        <div className="mt-6">
          <p className="text-sm">Discard this sitting?</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="h-10 flex-1" onClick={onCancelClear}>
              Keep
            </Button>
            <Button type="button" className="h-10 flex-1" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={onCopy}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={onAskClear}
          >
            Discard
          </Button>
          <Button type="button" className="ml-auto h-10" onClick={onDone}>
            {fromArchive ? "Back" : "Done"}
          </Button>
        </div>
      )}
    </div>
  )
}
