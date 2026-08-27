/**
 * Builds the dashboard Lambda bundle.
 *
 * `local-server.js` is dropped for the same reason the classifier drops
 * `server.js`: it binds a port, mounts the dev-only admin onboarding surface,
 * and enables the `?org=` switcher. None of that belongs in the deployed
 * function, and shipping it would put a tenant switcher one import away from
 * production code.
 *
 * The client scripts are asserted rather than assumed. Each one missing is a
 * 500 on exactly one page, which is the kind of break that reaches a customer
 * before it reaches a log.
 */

import { bundle } from "./bundle.mjs";

bundle({
  app: "dashboard",
  name: "dashboard",
  filter: "@sitewireai/dashboard",
  drop: ["local-server.js"],
  checks: [
    "handler.js",
    "client/capture-client.js",
    "client/assistant-client.js",
    "client/bid-client.js",
    "client/contact-client.js",
    "client/admin-upload-client.js",
  ],
});
