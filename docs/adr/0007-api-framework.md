# ADR-0007 — API framework: Fastify

**Status:** default.
**Date:** August 2026.

## Context

Technical plan §3 specifies TypeScript for the CRUD and orchestration services and
REST plus webhooks for integrations, explicitly deferring GraphQL. It does not name
a framework, and the services in `services/` are currently READMEs.

## Decision

**Fastify**, with `@fastify/type-provider-typebox` for schema-first routes.

- Request and response schemas are JSON Schema, which means validation, TypeScript
  types, and the OpenAPI document all come from one declaration. Integration
  partners (Procore, Jonas, Vista, Rhumbix) need that document to exist and stay
  honest.
- Rejected **NestJS**: the decorator and module ceremony pays off on a large team
  with many services, and costs a four-person team clarity it can't spare.
- Rejected **Express**: unmaintained middleware ecosystem and no first-class schema
  story, which is the whole reason to pick anything here.
- Rejected **Hono**: excellent at the edge, but these services are long-running and
  Postgres-bound, so the edge runtime buys nothing.

## Consequences

- Every route declares a schema. This is more typing up front and is the mechanism
  by which the API stays documented without a second source of truth.
- Validation failures are 400s with a machine-readable body by default, which
  matters when a customer's ERP is the caller.

## Reversal

**Low.** Route handlers are ordinary functions over a request and a reply. Domain
logic — the productivity join, evidence assembly — deliberately lives in packages
with no framework import, so a framework change touches the transport layer only.
