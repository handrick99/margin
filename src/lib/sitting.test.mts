import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  MAX_ARCHIVE,
  MAX_THOUGHT,
  archiveSitting,
  closeSitting,
  createSitting,
  formatElapsed,
  parkThought,
  parseStore,
  resume,
  screenFor,
  transcript,
  type Sitting,
  type Store,
} from "./sitting.ts"

function sitting(partial: Partial<Sitting> = {}): Sitting {
  return {
    id: "sit",
    startedAt: 1_000,
    endedAt: null,
    revealedAt: null,
    targetMinutes: 25,
    thoughts: [],
    draft: "",
    ...partial,
  }
}

describe("parkThought", () => {
  it("rejects empty and whitespace", () => {
    const current = sitting({ draft: "   " })
    assert.deepEqual(parkThought(current, "   ", 2_000), { ok: false, reason: "empty" })
    assert.equal(current.draft, "   ")
    assert.equal(current.thoughts.length, 0)
  })

  it("rejects a thought over 4000 characters and leaves the draft", () => {
    const text = "a".repeat(MAX_THOUGHT + 1)
    const current = sitting({ draft: text })
    assert.deepEqual(parkThought(current, text, 2_000), { ok: false, reason: "long" })
    assert.equal(current.thoughts.length, 0)
  })

  it("parks trimmed text, clears the draft, and records the offset", () => {
    const current = sitting({ draft: "  hello  " })
    const result = parkThought(current, current.draft, 6_500)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.sitting.draft, "")
    assert.equal(result.sitting.thoughts.length, 1)
    assert.equal(result.sitting.thoughts[0].text, "hello")
    assert.equal(result.sitting.thoughts[0].offsetMs, 5_500)
    assert.equal(current.thoughts.length, 0)
  })
})

describe("closeSitting", () => {
  it("parks a pending draft before sealing", () => {
    const result = closeSitting(sitting({ draft: "still here" }), 9_000)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.sitting.endedAt, 9_000)
    assert.equal(result.sitting.draft, "")
    assert.equal(result.sitting.thoughts[0].text, "still here")
    assert.equal(result.sitting.thoughts[0].offsetMs, 8_000)
  })

  it("seals a whitespace draft without storing it", () => {
    const result = closeSitting(sitting({ draft: " \n " }), 4_000)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.sitting.thoughts.length, 0)
    assert.equal(result.sitting.draft, "")
    assert.equal(result.sitting.endedAt, 4_000)
  })

  it("refuses to seal when the draft is too long", () => {
    const current = sitting({ draft: "b".repeat(MAX_THOUGHT + 5), thoughts: [] })
    const result = closeSitting(current, 4_000)
    assert.deepEqual(result, { ok: false, reason: "long" })
    assert.equal(current.endedAt, null)
  })
})

describe("resume", () => {
  it("continues from the frozen elapsed time", () => {
    const sealed = sitting({
      endedAt: 11_000,
      thoughts: [{ id: "t", text: "note", offsetMs: 4_000 }],
    })
    const next = resume(sealed, 30_000)
    assert.equal(next.endedAt, null)
    assert.equal(next.revealedAt, null)
    assert.equal(next.startedAt, 20_000)
    assert.equal(next.thoughts[0].offsetMs, 4_000)
    assert.equal(30_000 - next.startedAt, 10_000)
  })
})

describe("archive", () => {
  it("keeps the newest 40 and drops the oldest", () => {
    const archive = Array.from({ length: MAX_ARCHIVE }, (_, index) =>
      sitting({ id: `old-${index}`, endedAt: 2_000 }),
    )
    const store: Store = { theme: "ink", active: sitting({ id: "new" }), archive }
    const done = sitting({ id: "new", endedAt: 5_000, revealedAt: 6_000 })
    const next = archiveSitting(store, done)
    assert.equal(next.active, null)
    assert.equal(next.archive.length, MAX_ARCHIVE)
    assert.equal(next.archive[0].id, "new")
    assert.equal(next.archive.some((item) => item.id === "old-39"), false)
  })
})

describe("screenFor", () => {
  it("does not open an archive while a sitting is live or sealed", () => {
    const live: Store = { theme: "ink", active: sitting(), archive: [sitting({ id: "past", endedAt: 2 })] }
    assert.equal(screenFor(live, "past"), "live")
    const sealed: Store = {
      theme: "ink",
      active: sitting({ endedAt: 5_000 }),
      archive: [sitting({ id: "past", endedAt: 2 })],
    }
    assert.equal(screenFor(sealed, "past"), "sealed")
  })

  it("opens an archive only from the desk", () => {
    const store: Store = {
      theme: "paper",
      active: null,
      archive: [sitting({ id: "past", endedAt: 2_000 })],
    }
    assert.equal(screenFor(store, "past"), "open")
    assert.equal(screenFor(store, "missing"), "idle")
    assert.equal(screenFor({ ...store, active: sitting({ revealedAt: 9 }) }, "past"), "open")
  })
})

describe("parseStore", () => {
  it("sanitizes corrupt JSON without throwing", () => {
    assert.deepEqual(parseStore("{", "paper"), { theme: "paper", active: null, archive: [] })
    assert.deepEqual(parseStore("null", "ink"), { theme: "ink", active: null, archive: [] })
  })

  it("drops blank or oversized thoughts and keeps a live draft", () => {
    const raw = JSON.stringify({
      theme: "paper",
      active: {
        id: "live",
        startedAt: 10,
        endedAt: null,
        revealedAt: null,
        targetMinutes: 90,
        draft: "unsent",
        thoughts: [
          { id: "ok", text: " kept ", offsetMs: 15 },
          { id: "blank", text: "   ", offsetMs: 20 },
          { id: "huge", text: "x".repeat(MAX_THOUGHT + 1), offsetMs: 30 },
        ],
      },
      archive: [],
    })
    const store = parseStore(raw, "ink")
    assert.equal(store.theme, "ink")
    assert.equal(store.active?.targetMinutes, null)
    assert.equal(store.active?.draft, "unsent")
    assert.deepEqual(
      store.active?.thoughts.map((thought) => thought.text),
      ["kept"],
    )
  })
})

describe("formatters", () => {
  it("formats clocks and transcripts in parked order", () => {
    assert.equal(formatElapsed(0), "00:00")
    assert.equal(formatElapsed(61_000), "01:01")
    assert.equal(formatElapsed(3_661_000), "1:01:01")
    const current = sitting({
      endedAt: 80_000,
      thoughts: [
        { id: "a", text: "first", offsetMs: 5_000 },
        { id: "b", text: "second\nline", offsetMs: 70_000 },
      ],
    })
    const text = transcript(current)
    const first = text.indexOf("00:05\nfirst")
    const second = text.indexOf("01:10\nsecond\nline")
    assert.ok(first >= 0)
    assert.ok(second > first)
    assert.match(transcript(sitting({ endedAt: 1_000 })), /Nothing wandered in\./)
  })

  it("creates an open or timed sitting", () => {
    const open = createSitting(null, 50)
    const timed = createSitting(50, 50)
    assert.equal(open.targetMinutes, null)
    assert.equal(open.startedAt, 50)
    assert.equal(timed.targetMinutes, 50)
    assert.equal(timed.thoughts.length, 0)
  })
})
