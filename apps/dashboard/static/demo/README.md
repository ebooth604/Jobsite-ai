# static/demo

Demo capture imagery. **Dev only** — this directory is not included in the Lambda
deployment bundle, and the routes that serve it are mounted by the local dev
server alone.

## Expected file

    drywall-l4.jpg

A photographed drywall room used to show what a capture looks like once the
annotation layer has real detections on it. Save the demo photo here under that
exact name; the page renders a "file missing" state rather than a broken image if
it is absent.

## Why the annotations are still simulated

The photograph is real. Every number drawn on top of it — sheet count, confidence,
condition scores — is invented for the demo. Nobody measured this room, so the
capture carries `origin: "simulated"` and can never enter a held-out set or reach
an accuracy figure (technical plan §5.4d, §11).

A real photo with invented numbers on it is exactly the thing that would be most
tempting to quote in a deck. It is labelled on the page for that reason.
