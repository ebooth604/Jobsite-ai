# ADR-0009 — Mobile capture app: Expo (React Native)

**Status:** default. Not urgent — no mobile code exists yet.
**Date:** August 2026.

## Context

Technical plan §3 calls for React Native or Flutter, on the grounds that a small
team cannot maintain two native codebases and foremen carry both platforms. The
capture app has one unusual requirement that should drive the choice: **it must work
with no signal**. A jobsite basement has no connectivity, and capture that fails on
a bad connection is capture that does not happen — which is the behavioural bet the
whole plan rests on (decision log §10).

## Decision

**Expo**, on React Native.

- Over bare React Native: EAS Build removes the Xcode and Gradle maintenance that
  would otherwise consume a meaningful share of a four-person team.
- Over Flutter: the team is TypeScript-first, and types can be shared with the API
  via `packages/shared-types`. Flutter's rendering advantages do not matter for a
  camera screen and a list.
- **Offline-first is a requirement, not a feature.** Captures queue to local storage
  with the upload retried opportunistically. The UI must show a foreman what has not
  yet reached the server, because silent failure destroys trust in the number.
- On-device face blur runs as the first pass (technical plan §3), with the
  server-side re-check from ADR-0006 as the enforcing one.

## Consequences

- Expo's managed native modules constrain some camera-level control. If frame-level
  access for on-device blur proves insufficient, a development build with a custom
  native module is the escape hatch, and it is a known one.
- OTA updates are available, which for a field app with slow enterprise app-store
  cycles is a genuine operational advantage.

## Reversal

**Low now, high later.** Nothing is built, so this costs nothing to change today.
Once there is a capture app in foremen's hands, replacing it is a rewrite plus a
redeployment to every crew — so this is worth the technical founder's confirmation
before the first sprint, not after.
