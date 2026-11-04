"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  MAX_THOUGHT,
  archiveSitting,
  closeSitting,
  createSitting,
  formatElapsed,
  formatLength,
  formatWhen,
  parkThought,
  reveal,
  resume,
  screenFor,
  sittingLength,
  transcript,
  type Sitting,
  type Store,
  type Theme,
} from "@/lib/sitting"
import { loadStore, saveStore } from "@/lib/storage"

const LENGTHS: { label: string; minutes: number | null }[] = [
  { label: "25 min", minutes: 25 },
  { label: "50 min", minutes: 50 },
  { label: "Open", minutes: null },
]

function themeColor(theme: Theme) {
  return theme === "ink" ? "#171717" : "#e6e6e6"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "ink")
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor(theme))
}

function heldLabel(count: number) {
  if (count === 0) return "Nothing held yet"
  return `${count} held`
}

export function MarginWidget() {
  const [store, setStore] = useState<Store | null>(null)
  const [persistent, setPersistent] = useState(true)
  const [draft, setDraft] = useState("")
  const [target, setTarget] = useState<number | null>(25)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const [justHeld, setJustHeld] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [viewing, setViewing] = useState<Sitting | null>(null)
  const draftRef = useRef("")
  const storeRef = useRef<Store | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const revealRef = useRef<HTMLButtonElement>(null)
  const composingRef = useRef(false)
  const parkLock = useRef(false)
  const shiftHeld = useRef(false)

  storeRef.current = store
  const screen = store ? screenFor(store, viewing?.id ?? null) : "loading"
  const active = store?.active ?? null
  const archiveHit =
    viewing && store?.archive.some((item) => item.id === viewing.id) ? viewing : null
  const openSitting = active?.revealedAt ? active : archiveHit

  useEffect(() => {
    const loaded = loadStore()
    storeRef.current = loaded.store
    draftRef.current = loaded.store.active?.draft ?? ""
    setStore(loaded.store)
    setPersistent(loaded.persistent)
    setDraft(loaded.store.active?.draft ?? "")
    applyTheme(loaded.store.theme)
  }, [])

  useEffect(() => {
    if (screen !== "live") return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [screen])

  useEffect(() => {
    if (screen === "live") inputRef.current?.focus()
    if (screen === "sealed") revealRef.current?.focus()
  }, [screen, active?.id])

  useEffect(() => {
    const id = window.setTimeout(() => {
      const current = storeRef.current
      if (!current?.active || current.active.endedAt || current.active.revealedAt) return
      if (current.active.draft === draftRef.current) return
      const next = { ...current, active: { ...current.active, draft: draftRef.current } }
      storeRef.current = next
      setStore(next)
      setPersistent(saveStore(next))
    }, 250)
    return () => window.clearTimeout(id)
  }, [draft])

  useEffect(() => {
    const flush = () => {
      const current = storeRef.current
      if (!current) return
      let next = current
      if (current.active && !current.active.endedAt && !current.active.revealedAt && current.active.draft !== draftRef.current) {
        next = { ...current, active: { ...current.active, draft: draftRef.current } }
        storeRef.current = next
      }
      if (!saveStore(next)) setPersistent(false)
    }
    window.addEventListener("pagehide", flush)
    return () => window.removeEventListener("pagehide", flush)
  }, [])

  useEffect(() => {
    if (!justHeld) return
    const id = window.setTimeout(() => setJustHeld(false), 1200)
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

  function begin() {
    if (!store || store.active) return
    setViewing(null)
    setNotice(null)
    setConfirmClear(false)
    draftRef.current = ""
    setDraft("")
    persist({ ...store, active: createSitting(target, Date.now()) })
  }

  function parkCurrent() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt || current.active.revealedAt) return
    const result = parkThought(current.active, draftRef.current, Date.now())
    if (!result.ok) {
      if (result.reason === "long") setNotice("Shorten it to 4,000 characters.")
      return
    }
    draftRef.current = ""
    setDraft("")
    setNotice(null)
    setJustHeld(true)
    persist({ ...current, active: result.sitting })
  }

  function tryPark() {
    if (composingRef.current || parkLock.current) return
    parkLock.current = true
    parkCurrent()
    window.requestAnimationFrame(() => {
      parkLock.current = false
    })
  }

  function endSitting() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt || current.active.revealedAt) return
    const result = closeSitting({ ...current.active, draft: draftRef.current }, Date.now())
    if (!result.ok) {
      setNotice("Shorten it before you end the sitting.")
      inputRef.current?.focus()
      return
    }
    draftRef.current = ""
    setDraft("")
    setNotice(null)
    setJustHeld(false)
    persist({ ...current, active: result.sitting })
  }

  function onReveal() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt == null) return
    setNotice(null)
    persist({ ...current, active: reveal(current.active, Date.now()) })
  }

  function onResume() {
    const current = storeRef.current
    if (!current?.active || current.active.endedAt == null) return
    setNotice(null)
    setViewing(null)
    persist({ ...current, active: resume(current.active, Date.now()) })
  }

  function finish() {
    const current = storeRef.current
    if (!current?.active?.revealedAt) return
    setViewing(null)
    setConfirmClear(false)
    setCopied(false)
    setNotice(null)
    persist(archiveSitting(current, current.active))
  }

  function discard() {
    const current = storeRef.current
    if (!current) return
    if (archiveHit && !current.active?.revealedAt) {
      persist({
        ...current,
        archive: current.archive.filter((item) => item.id !== archiveHit.id),
      })
      setViewing(null)
    } else if (current.active?.revealedAt) {
      persist({ ...current, active: null })
    }
    setConfirmClear(false)
    setCopied(false)
    setNotice(null)
  }

  async function copyAll(sitting: Sitting) {
    const text = transcript(sitting)
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable")
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setNotice("Could not copy. Select the thoughts instead.")
    }
  }

  const elapsed = active ? sittingLength(active, now) : 0
  const targetMs = active?.targetMinutes ? active.targetMinutes * 60_000 : null
  const blockDone = screen === "live" && targetMs !== null && elapsed >= targetMs
  const progress = targetMs ? Math.min(100, (elapsed / targetMs) * 100) : 0
  const tooLong = draft.trim().length > MAX_THOUGHT

  return (
    <main className="desk flex min-h-dvh flex-col items-center px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <section
        className="margin-widget w-[min(100%,24rem)] px-5 py-5 sm:px-6 sm:py-6 md:my-auto"
        aria-label="Margin"
        aria-busy={screen === "loading"}
        data-phase={screen}
      >
        <header className="mb-6 flex items-center justify-between gap-3">
          <h1 id="margin-title" className="text-base font-medium tracking-tight">
            Margin
          </h1>
          {store ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={switchTheme}
              aria-label={store.theme === "ink" ? "Switch to paper" : "Switch to ink"}
            >
              {store.theme === "ink" ? "Paper" : "Ink"}
            </Button>
          ) : (
            <div className="h-7 w-14 rounded-md bg-muted" />
          )}
        </header>

        {screen === "loading" ? <Loading /> : null}

        {screen === "idle" && store ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-[1.35rem] font-medium leading-snug">Park what interrupts you.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                It stays closed until you end the sitting.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="group" aria-label="Sitting length">
              {LENGTHS.map((option) => {
                const selected = target === option.minutes
                return (
                  <Button
                    key={option.label}
                    type="button"
                    variant={selected ? "default" : "ghost"}
                    className="h-9"
                    aria-pressed={selected}
                    onClick={() => setTarget(option.minutes)}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
            <Button type="button" className="h-11 w-full" onClick={begin}>
              Begin sitting
            </Button>
            {store.archive.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Earlier</p>
                <ul className="max-h-48 overflow-y-auto">
                  {store.archive.map((sitting) => {
                    const when = formatWhen(sitting.startedAt)
                    const length = formatLength(sittingLength(sitting, sitting.endedAt ?? sitting.startedAt))
                    const count = sitting.thoughts.length
                    return (
                      <li key={sitting.id} className="border-b border-border last:border-b-0">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-between gap-3 rounded-none px-0 py-2.5 font-normal whitespace-normal"
                          aria-label={`${when}, ${length}, ${count} ${count === 1 ? "thought" : "thoughts"}`}
                          onClick={() => {
                            if (store.active) return
                            setNotice(null)
                            setConfirmClear(false)
                            setCopied(false)
                            setViewing(sitting)
                          }}
                        >
                          <span>{when}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {length}
                            {" · "}
                            {count}
                          </span>
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {screen === "live" && active ? (
          <div>
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="breathe inline-block size-1.5 rounded-full bg-foreground" aria-hidden />
                  {blockDone ? "Block finished" : "Studying"}
                </p>
                <p className="mt-1 text-3xl font-medium tabular-nums tracking-tight">{formatElapsed(elapsed)}</p>
              </div>
              <p className="pb-1 text-sm text-muted-foreground tabular-nums">
                {active.targetMinutes ? `${active.targetMinutes} min` : "Open"}
              </p>
            </div>
            {targetMs ? (
              <div
                className="relative mb-5 h-px w-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                aria-label="Block"
              >
                <div className="absolute inset-y-0 left-0 bg-foreground/80" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            {blockDone ? (
              <p className="mb-4 text-sm text-muted-foreground" role="status">
                The block is finished. You can keep writing.
              </p>
            ) : null}
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                const value = event.target.value.length > 8000 ? event.target.value.slice(0, 8000) : event.target.value
                draftRef.current = value
                setDraft(value)
                if (notice) setNotice(null)
              }}
              onCompositionStart={() => {
                composingRef.current = true
              }}
              onCompositionEnd={() => {
                window.setTimeout(() => {
                  composingRef.current = false
                }, 0)
              }}
              onKeyDown={(event) => {
                shiftHeld.current = event.shiftKey
                if (event.nativeEvent.isComposing || composingRef.current) return
                if (event.key !== "Enter" || event.shiftKey) return
                event.preventDefault()
                if (event.repeat || parkLock.current) return
                tryPark()
              }}
              onKeyUp={(event) => {
                if (event.key === "Shift") shiftHeld.current = false
              }}
              onBeforeInput={(event) => {
                const native = event.nativeEvent
                if (!(native instanceof InputEvent) || native.isComposing || composingRef.current) return
                const lineBreak = native.inputType === "insertLineBreak" || native.inputType === "insertParagraph"
                if (!lineBreak || shiftHeld.current) return
                event.preventDefault()
                if (parkLock.current) return
                tryPark()
              }}
              placeholder="A stray thought"
              aria-label="Thought to park"
              aria-describedby="margin-park-help"
              aria-invalid={tooLong || undefined}
              rows={3}
              autoComplete="off"
              spellCheck
              autoFocus
              className="min-h-24 resize-none border-border bg-background/60 px-3 py-3 font-serif text-base leading-relaxed md:text-base"
            />
            <p id="margin-park-help" className="mt-2 text-xs text-muted-foreground">
              Return to park it. It stays hidden.
            </p>
            {notice ? (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                {notice}
              </p>
            ) : tooLong ? (
              <p className="mt-3 text-sm text-muted-foreground" role="status">
                Shorten it to 4,000 characters.
              </p>
            ) : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-sm tabular-nums" aria-live="polite">
                <span className={active.thoughts.length === 0 ? "text-muted-foreground" : undefined}>
                  {heldLabel(active.thoughts.length)}
                </span>
                {justHeld ? <span className="text-muted-foreground"> Held</span> : null}
              </p>
              <Button type="button" variant="outline" className="h-10 px-4" onClick={endSitting}>
                End sitting
              </Button>
            </div>
          </div>
        ) : null}

        {screen === "sealed" && active ? (
          <div>
            <p className="text-sm text-muted-foreground">Sitting closed</p>
            <p className="mt-2 text-3xl font-medium tabular-nums tracking-tight">
              {formatElapsed(sittingLength(active, active.endedAt ?? now))}
            </p>
            <p className="mt-4 text-xl font-medium leading-snug">
              {active.thoughts.length === 0 ? "Nothing was held." : `${active.thoughts.length} still put away.`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">They stay closed until you reveal them.</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" className="h-11" ref={revealRef} autoFocus onClick={onReveal}>
                Reveal
              </Button>
              <Button type="button" variant="ghost" onClick={onResume}>
                Resume
              </Button>
            </div>
          </div>
        ) : null}

        {screen === "open" && openSitting ? (
          <Reveal
            sitting={openSitting}
            fromArchive={!active?.revealedAt}
            copied={copied}
            confirmClear={confirmClear}
            notice={notice}
            onCopy={() => void copyAll(openSitting)}
            onDone={!active?.revealedAt ? () => setViewing(null) : finish}
            onAskClear={() => setConfirmClear(true)}
            onCancelClear={() => setConfirmClear(false)}
            onDiscard={discard}
          />
        ) : null}

        {!persistent && screen !== "loading" ? (
          <p className="mt-5 text-xs text-muted-foreground">This sitting stays in this tab only.</p>
        ) : null}
      </section>
    </main>
  )
}

function Loading() {
  return (
    <div className="space-y-3">
      <div className="h-7 w-40 rounded-md bg-muted" aria-hidden />
      <div className="h-4 w-full rounded-md bg-muted" aria-hidden />
      <div className="h-11 w-full rounded-xl bg-muted" aria-hidden />
      <p className="sr-only">Loading</p>
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
          <p className="text-sm text-muted-foreground">{fromArchive ? formatWhen(sitting.startedAt) : "After"}</p>
          <p className="mt-1 text-[1.65rem] font-medium leading-none tabular-nums">{length}</p>
        </div>
        <p className="pb-1 text-sm text-muted-foreground tabular-nums">
          {sitting.thoughts.length === 1 ? "1 thought" : `${sitting.thoughts.length} thoughts`}
        </p>
      </div>
      {sitting.thoughts.length === 0 ? (
        <p className="font-serif text-xl leading-snug">Nothing wandered in.</p>
      ) : (
        <ul className="max-h-[min(52vh,28rem)] space-y-5 overflow-y-auto pr-1">
          {sitting.thoughts.map((thought, index) => (
            <li
              key={thought.id}
              className="thought-row"
              style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
            >
              <p className="text-xs text-muted-foreground tabular-nums">{formatElapsed(thought.offsetMs)}</p>
              <p className="mt-1 font-serif text-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                {thought.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {notice ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {confirmClear ? (
        <div className="mt-6">
          <p className="text-sm">Discard this sitting?</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="h-10 flex-1" autoFocus onClick={onCancelClear}>
              Keep
            </Button>
            <Button type="button" className="h-10 flex-1" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={onAskClear}>
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
