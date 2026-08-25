/**
 * The two addresses, defined once.
 *
 * They are not interchangeable, and the split is the point:
 *
 *   ADMIN_EMAIL  — machine-to-human. Onboarding records, alerts, anything the
 *                  system sends about itself. Never printed on a customer-facing
 *                  page, because publishing an operational inbox invites mail it
 *                  is not staffed to answer.
 *   CONTACT_EMAIL — human-to-human. Contact and help pages, and anything a
 *                  customer is invited to reply to.
 *
 * Nothing here sends mail. There is no mail transport wired up, so pages that
 * reference these addresses say what *would* happen rather than implying a
 * message went somewhere.
 */

export const ADMIN_EMAIL = "appdata@sitewireai.com";
export const CONTACT_EMAIL = "info@sitewireai.com";
