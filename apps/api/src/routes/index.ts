import { computeProductivity } from '@jobsite/domain';

export interface RouteContext {
  url: URL;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  handler: (ctx: RouteContext) => Promise<RouteResult> | RouteResult;
}

/**
 * Marks a route that exists to define the shape of the API without
 * pretending to implement it. Returns 501, not a fake 200 — a stub that
 * returns plausible data is how a team convinces itself something works.
 */
export class NotImplementedError extends Error {
  override name = 'NotImplementedError';
  constructor(phase: string) {
    super(`not implemented — scheduled for ${phase} (see docs/architecture.md §8)`);
  }
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/health',
    handler: () => ({ status: 200, body: { ok: true } }),
  },

  /**
   * The one piece of real logic reachable over HTTP today: the productivity
   * calculation, which needs no database and no model. It exists so the
   * arithmetic can be exercised against real bid numbers during discovery
   * calls, before any of the rest is built.
   *
   * GET /productivity?budgetedQuantity=12000&budgetedHours=780
   *                  &installedQuantity=7000&actualHours=600
   */
  {
    method: 'GET',
    path: '/productivity',
    handler: ({ url }) => {
      const num = (key: string): number | null => {
        const raw = url.searchParams.get(key);
        if (raw === null) return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      };

      const budgetedQuantity = num('budgetedQuantity');
      const budgetedHours = num('budgetedHours');
      const installedQuantity = num('installedQuantity');
      const actualHours = num('actualHours');

      if (
        budgetedQuantity === null ||
        budgetedHours === null ||
        installedQuantity === null ||
        actualHours === null
      ) {
        return {
          status: 400,
          body: {
            error: 'missing_parameters',
            required: ['budgetedQuantity', 'budgetedHours', 'installedQuantity', 'actualHours'],
          },
        };
      }

      try {
        return {
          status: 200,
          body: computeProductivity({
            scopeItem: { budgetedQuantity, budgetedHours },
            installedQuantity,
            actualHours,
          }),
        };
      } catch (error) {
        return {
          status: 422,
          body: {
            error: 'unusable_bid',
            message: error instanceof Error ? error.message : 'unknown',
          },
        };
      }
    },
  },

  // ---- Shape only. Each throws until its phase arrives. ----

  {
    method: 'POST',
    path: '/captures',
    handler: () => {
      // Phase 1. Must blur faces before the first durable write and discard
      // the original — see docs/architecture.md §2 and decisions.md §9.
      throw new NotImplementedError('phase 1 — capture + ingest');
    },
  },
  {
    method: 'POST',
    path: '/labor-days',
    handler: () => {
      // Phase 2. Ingest from Procore/Jonas/Vista/Rhumbix. Crew-level only:
      // reject any payload carrying per-worker attribution.
      throw new NotImplementedError('phase 2 — timekeeping join');
    },
  },
  {
    method: 'GET',
    path: '/projects',
    handler: () => {
      throw new NotImplementedError('phase 1 — projects and scope items');
    },
  },
  {
    method: 'GET',
    path: '/alerts',
    handler: () => {
      // Phase 3. detectDrift() in @jobsite/domain already implements the rule.
      throw new NotImplementedError('phase 3 — alerting');
    },
  },
  {
    method: 'POST',
    path: '/evidence-packages',
    handler: () => {
      // Phase 4. Immutable once issued; renderer is per-jurisdiction.
      throw new NotImplementedError('phase 4 — evidence packages');
    },
  },
];
