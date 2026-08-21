# services/ingestion

Capture intake. Everything entering the system passes through here, and this is
where the privacy commitment is actually enforced.

## What it owns

- Receiving uploads from the mobile app and from photo-sync connectors
- EXIF and geolocation extraction; dedupe against already-ingested media
- Virus/malware scan, size and MIME validation
- **Server-side face blur, before anything reaches persistent storage**
- Setting `Capture.origin` (`field | self_measured | simulated`) at ingest
- Writing `face_blur_status` per capture and alerting on failures

## Constraints that bind here

These are contractual commitments in the business plan (§4.3), not goals:

- **An unblurred original is never written to disk or object storage** — not even
  transiently past the blur step. The mobile app may blur first; this service
  re-checks regardless. Two independent passes, because a client-side bug is not
  an acceptable failure mode for a promise made in a contract.
- **`origin` is set here and never inferred later.** It is what makes the held-out
  leak assertion enforceable — simulated captures must never reach a measurement
  set (technical plan §5.4d, §11).
- All media lands in a Canadian region, verified by bucket/region config rather
  than provider default.

## Status

Not started. Q1 deliverable — the face-blur path is a launch blocker for the first
design partner, not a follow-up.
