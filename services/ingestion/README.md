# services/ingestion

Capture intake. Everything entering the system passes through here.

## What it owns

- Receiving uploads from the mobile app and from photo-sync connectors
- EXIF and geolocation extraction; dedupe against already-ingested media
- Virus/malware scan, size and MIME validation
- Setting `Capture.origin` (`field | self_measured | simulated`) at ingest

## Constraints that bind here

These are contractual commitments in the business plan (§4.3), not goals:

- **`origin` is set here and never inferred later.** It is what makes the held-out
  leak assertion enforceable — simulated captures must never reach a measurement
  set (technical plan §5.4d, §11).
- All media lands in a Canadian region, verified by bucket/region config rather
  than provider default.

## Status

Not started. Q1 deliverable.

Face redaction is deliberately **not** part of this service for now — see
`docs/decisions.md` §12. If it returns, it returns here, server-side.
