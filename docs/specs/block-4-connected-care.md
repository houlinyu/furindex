# Block 4 — Connected Care (Devices + Guided Health Check + Dashboard)

> Source: collaborator spec, 2026-08-23. Verbatim intent preserved; the
> **Feasibility** notes are this repo's own assessment, added during triage.

Three inputs (wearable, home camera, guided manual check) feed one output (the
health dashboard). Structured as independently skippable sub-steps.

```
4.1 Connect Devices ──┬── Wearable (Bluetooth)
                      └── Home Security Camera (API)
4.2 Guided Health Check ── photo/video/audio per body part
4.3 How's your pet feeling? ── free-text/voice + quick sensation tags
        │
        ▼
4.4 Dashboard — KPIs + part-by-part status
```

## 4.1a — Connect a Wearable
Bluetooth scan (Web Bluetooth if browser, native SDK if app). Match against a
supported-device list (temp / HR / activity / GPS). Sync scope from
`wants_to_track[]` in Block 1 Screen 1.7. Sync frequency: real-time / hourly /
daily digest. Fallback: "No wearable? You can still track everything manually."

**Feasibility: BLOCKED, not scheduled.** Web Bluetooth is unimplemented in
Safari and on iOS — Apple has declined it — which is most of a pet app's users.
And no consumer pet collar exposes a public BLE GATT profile: Tractive has no
public API, Fi's is undocumented with a 90-day cap, Whistle was discontinued and
its collars switched off in Aug 2025. FitBark's OAuth REST API is the one open
door and it is HTTP, not Bluetooth. The achievable version is FitBark OAuth plus
manual entry.

## 4.1b — Connect a Home Camera
Supported integrations (Furbo, Ring, Nest, Wyze, or generic RTSP/ONVIF).
Per-vendor OAuth — this is not one generic connector. Ask what to pull: motion
events, feeding-zone visits, bark/meow clips.

**Consent screen is a hard requirement, not polish.** A home camera captures
people, not just the pet. Before enabling, disclose what is stored, for how long,
and who can see clips (owner only vs shared with vet), and take explicit
confirmation.

The spec's own rule, which this repo adopts: *don't promise integrations you
haven't built.*

**Feasibility: BLOCKED.** Every vendor requires its own developer programme and
approval. Nothing to build until a partnership exists.

```json
{ "source":"camera", "device_id":"uuid",
  "event_type":"motion | feeding_zone | bark_detected | manual_clip",
  "clip_url":"...", "timestamp":"...", "duration_sec":12 }
```

## 4.2 — Guided Health Check
A checklist of micro-cards, not one uploader. Each carries a one-line "why we
ask" so it does not feel like a random photo dump.

| Body part | Capture | Why we ask (shown to the user) |
|---|---|---|
| Eyes | photo | Discharge, redness, or cloudiness can be early signs of infection or aging |
| Mouth / gums / teeth | photo | Gum colour and tartar buildup are early dental & systemic health indicators |
| Ears | photo | Odour, redness, or discharge often signal ear infections |
| Paws / feet | photo | Cracked pads, swelling, or limping patterns show up here first |
| Coat / skin | photo | Bald patches, flakes, or lumps are easiest to catch with a clear photo |
| Nose | photo (optional) | Texture/discharge changes can matter for some conditions |
| Poop | photo | Consistency and colour are some of the most useful at-home signals |
| Gait / movement | video 5–10s | Limping or stiffness is much easier to catch in motion |
| General behaviour | video/audio | Anything odd — vocalising, panting, restlessness |

Each card prompts a **self-assessment, not a diagnosis**: `looks_normal /
not_sure / looks_off`, plain language, no medical jargon. Optional caption or
voice note.

Any AI-suggested flag is surfaced as "worth a second look" — **never**
auto-labelled as a diagnosis or symptom without the owner (or, later, a vet)
confirming.

```json
{ "part":"eyes", "media_id":"uuid", "type":"photo | video | audio",
  "captured_at":"timestamp",
  "self_assessment":"looks_normal | not_sure | looks_off",
  "note":"free text or transcribed voice",
  "ai_review_status":"pending | reviewed | flagged" }
```

**Feasibility: BUILDABLE NOW.** No third party needed.

## 4.3 — How's Your Pet Feeling?
The qualitative layer where "he's been acting weird" is actually captured.
- Open text or voice note: "Anything feel different lately?"
- Quick sensation tags: appetite / energy / bathroom / mobility / sleep / mood
  change, or no changes noticed
- Energy-mood slider 1–5, timestamped, so it can be plotted against objective KPIs

**Feasibility: BUILDABLE NOW.**

## 4.4 — Dashboard
Must read as a health dashboard, not a form summary.

**KPI cards:** active/walking time (today, 7-day avg), distance, speed (avg/peak),
energy score (composite of activity + mood slider + sleep), heart rate, sleep
hours, temperature, eating/drinking events.

> Every KPI card shows its **source** — device-synced vs manually logged vs
> estimated. Do not blur objective sensor data with subjective owner input.

**Part-by-part status:** body-map/checklist mirroring 4.2 — last checked, status
(green normal / yellow not sure / red flagged), tap for that part's photo history.
Prompt re-checks on a cadence so the onboarding check becomes a habit.

**Trends & correlated alerts:** time-series per KPI with manual logs and camera
events overlaid as markers. Alert cards combining sources. One-tap "Export this
for my vet".

```json
{ "pet_id":"uuid", "period":"7d",
  "kpis": { "active_minutes":{"value":62,"source":"wearable"},
            "energy_score":{"value":0.72,"source":"computed"} },
  "body_parts":[{"part":"eyes","status":"normal","last_checked":"2026-08-10"}],
  "alerts":[{"type":"correlation","message":"Energy down + appetite change + gait flagged","severity":"review"}] }
```

**Feasibility: BUILDABLE NOW** against whatever data exists, with sources
labelled honestly and cards absent rather than faked when a source is missing.
