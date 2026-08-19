# apps/mobile — capture app

React Native (or Flutter — technical plan §3 leaves the final call to the technical
founder). One codebase for iOS and Android, because foremen use both and a
four-person eng team cannot carry two native apps.

## What it owns

- Photo and short-video capture, with area label and scope-item context
- Geotagging and capture metadata (`captured_at`, `geolocation`, `area`)
- **Offline queue** — jobsites lose signal; captures must survive it and upload later
- On-device face-blur pass (see constraint below)
- The abstention prompt: "needs 30 seconds of foreman input" when the model declines
  to guess (technical plan §5.3)
- Correction UI — a foreman fixing an estimate is the training signal (§5.4c)

## Constraints that bind here

- **Face blur runs on-device where feasible, and the server re-checks at ingest
  anyway.** The client pass is a latency and bandwidth optimization, never the
  guarantee. A client-side bug must not be able to put an unblurred face in
  storage. See technical plan §3 and §8.
- **`captured_by` is provenance, not performance.** It exists for audit and is never
  surfaced, aggregated, or charted as an individual-worker metric. Technical plan §4.
- Crew-day capture rate must be measurable from the app (captures logged / expected
  crew-days) — it is a stated kill criterion, business plan §15.

## Status

Not started. Directory reserved by the §10 layout.
