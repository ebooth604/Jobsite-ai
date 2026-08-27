/**
 * Builds the classifier Lambda bundle.
 *
 * The mechanics live in `bundle.mjs`, shared with the dashboard — see the note
 * there about pnpm symlinks and `workspace:*`, both of which this app now hits
 * since the classifier moved into `@sitewireai/classify`.
 *
 * `server.js` is dropped: it is the local dev entry point, binds a port, and
 * would be dead weight next to the handler that matters.
 */

import { bundle } from "./bundle.mjs";

bundle({
  app: "trainer",
  name: "classifier",
  filter: "@sitewireai/trainer",
  drop: ["server.js"],
  checks: ["handler.js", "client/upload-client.js"],
});
