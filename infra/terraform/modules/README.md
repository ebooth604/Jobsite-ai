# infra/terraform/modules

One module so far.

| Module | What it is |
|---|---|
| `corpus-bucket/` | Private, encrypted, versioned S3 for the training corpus — redacted jobsite media and the ground truth measured from it |

Modules land here when a piece of the footprint is real enough to have a boundary —
not before. `corpus-bucket` qualified because there is a tool writing real
photographs to it today ([`apps/trainer`](../../../apps/trainer/README.md)). The
remaining service boundaries in [`services/`](../../../services/README.md) are still
a hypothesis (network, an ECS/Fargate service wrapper, Cognito), and writing them
now would encode a guess about the seam rather than an observation of it.

## What binds any module added here

- **Region.** Modules take region from the root, never a hard-coded default. The
  root's guard rejects non-`ca-*`; a module carrying its own default routes around it.
- **Names.** Build from `local.name_prefix`, so one environment cannot collide with
  another in a global namespace like S3.
- **Tags.** Inherited from the provider's `default_tags`. A module that sets `tags`
  explicitly should merge, not replace.
- **Media buckets.** Encryption at rest, versioning, and a full public-access block
  are launch blockers, not follow-ups — technical plan §8.
