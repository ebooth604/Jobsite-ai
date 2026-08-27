/**
 * The client list, read from the product's own tenant store.
 *
 * There is deliberately no second source of truth here. A photo filed against
 * "Northpoint" in this tool and against `org-northpoint` in the dashboard would
 * be two different clients the day anyone tried to join them, so the trainer
 * reads the same DynamoDB org rows the dashboard resolves a session against.
 * Creating a client is still the admin console's job — this app only picks from
 * what exists.
 *
 * **A missing or unreachable table is not fatal.** The trainer's whole point is
 * that it starts with an API key and nothing else; failing to boot because AWS
 * credentials expired would make the labelling tool hostage to the cloud. When
 * the store cannot be read the list is empty, every photo is unassigned, and the
 * UI says why rather than pretending there are no clients.
 */

import { databaseConfigured, listOrgs } from "@sitewireai/db";

export interface Client {
  id: string;
  name: string;
  slug: string;
}

/** Why the list is empty, when it is. Rendered, so it has to be readable. */
export type ClientsProblem = string | null;

export interface ClientList {
  clients: Client[];
  problem: ClientsProblem;
}

/**
 * Cached for a minute.
 *
 * Every page render needs the list, and the tenant roster changes about as often
 * as a customer is signed. A minute is short enough that a client created in
 * `/admin` shows up while you are still switching windows.
 */
const TTL_MS = 60_000;
let cache: { at: number; value: ClientList } | null = null;

export function clientsConfigured(): boolean {
  return databaseConfigured();
}

export async function loadClients(): Promise<ClientList> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let value: ClientList;
  if (!databaseConfigured()) {
    value = {
      clients: [],
      problem:
        "SITEWIREAI_DOMAIN_TABLE is not set, so the client list cannot be read. " +
        "Photos can still be uploaded and classified; they will all sit under Unassigned.",
    };
  } else {
    try {
      const orgs = await listOrgs();
      value = { clients: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug })), problem: null };
    } catch (err) {
      value = {
        clients: [],
        problem: `Could not read the client list: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  cache = { at: Date.now(), value };
  return value;
}

/** Drops the cache so a newly created client appears without a restart. */
export function forgetClients(): void {
  cache = null;
}

export function findClient(clients: readonly Client[], ref: string): Client | null {
  if (!ref) return null;
  return clients.find((c) => c.id === ref || c.slug === ref) ?? null;
}

/**
 * The display name for a stored `clientRef`.
 *
 * A ref that no longer resolves keeps its raw value rather than vanishing — a
 * photo filed against a client that was later deleted should look wrong, not
 * look unassigned.
 */
export function clientLabel(clients: readonly Client[], ref: string): string {
  if (!ref) return "Unassigned";
  return findClient(clients, ref)?.name ?? ref;
}
