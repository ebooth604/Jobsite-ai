# infra/terraform/modules

Empty by design.

Modules land here when a piece of the footprint is real enough to have a boundary —
not before. The service boundaries in [`services/`](../../../services/README.md) are
a starting hypothesis for what those modules will be (network, media storage, an
ECS/Fargate service wrapper, Cognito), but writing them now would encode a guess
about the seam rather than an observation of it.

## What binds any module added here

- **Region.** Modules take region from the root, never a hard-coded default. The
  root's guard rejects non-`ca-*`; a module carrying its own default routes around it.
- **Names.** Build from `local.name_prefix`, so one environment cannot collide with
  another in a global namespace like S3.
- **Tags.** Inherited from the provider's `default_tags`. A module that sets `tags`
  explicitly should merge, not replace.
- **Media buckets.** Encryption at rest, versioning, and a full public-access block
  are launch blockers, not follow-ups — technical plan §8.
