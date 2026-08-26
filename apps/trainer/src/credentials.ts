/**
 * Credentials that refresh themselves.
 *
 * The `sitewire` profile uses `aws login` (AWS CLI 2.32+), which stores a
 * `login_session` the **SDK cannot read**. The documented workaround is to bridge
 * them into the environment:
 *
 *     eval "$(aws configure export-credentials --profile sitewire --format env)"
 *
 * That works, and it works for about fifteen minutes. The session auto-renews, but
 * an exported copy does not — it is a snapshot, and the process holding it has no
 * way to notice it has gone stale. In practice that means the reasoning endpoint
 * works right after a restart and returns 503 by the time anyone has labelled three
 * photos, which reads as a broken feature rather than an expired token.
 *
 * So instead of a snapshot, this asks the CLI for credentials the same way the CLI
 * asks itself, and hands the SDK a provider that knows when to ask again. The SDK
 * re-invokes a provider whose returned `expiration` has passed, so refresh is
 * automatic and the fifteen-minute window stops being anybody's problem.
 *
 * Shelling out per refresh is not elegant. The alternative is reimplementing the
 * `login_session` format against an undocumented on-disk structure, which would
 * break silently the first time the CLI changed it.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * The profile to ask. Unset means "let the SDK do whatever it normally does",
 * which is correct on a machine using static keys or an instance role — this whole
 * mechanism only exists for the `aws login` case.
 */
export function credentialProfile(env: NodeJS.ProcessEnv = process.env): string {
  return env.SITEWIREAI_AWS_PROFILE ?? env.AWS_PROFILE ?? "";
}

interface ExportedCredentials {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
  Expiration?: string;
}

/**
 * Asks the AWS CLI for the profile's current credentials.
 *
 * Returns null rather than throwing when the CLI is missing, the profile does not
 * exist, or the session has genuinely expired. The caller falls back to the SDK's
 * own chain, so a machine with static keys or an instance role is unaffected by
 * any of this.
 */
export async function credentialsFromCli(profile: string): Promise<ResolvedCredentials | null> {
  if (!profile) return null;

  try {
    const { stdout } = await run(
      "aws",
      ["configure", "export-credentials", "--profile", profile, "--format", "process"],
      // A credential fetch that hangs would hang the request that triggered it.
      { timeout: 15_000, windowsHide: true },
    );

    const parsed = JSON.parse(stdout) as ExportedCredentials;
    if (!parsed.AccessKeyId || !parsed.SecretAccessKey) return null;

    return {
      accessKeyId: parsed.AccessKeyId,
      secretAccessKey: parsed.SecretAccessKey,
      ...(parsed.SessionToken ? { sessionToken: parsed.SessionToken } : {}),
      ...(parsed.Expiration ? { expiration: new Date(parsed.Expiration) } : {}),
    };
  } catch {
    // Expired session, no CLI, unknown profile — all the same to the caller.
    return null;
  }
}

/**
 * A provider the SDK will re-invoke once the credentials it returned have expired.
 *
 * Returning `expiration` is what makes that happen: without it the SDK treats the
 * credentials as permanent and keeps using a token that stopped working twenty
 * minutes ago.
 *
 * The returned expiry is shaved by a minute. A token that expires *during* a
 * Bedrock call fails the call; refreshing slightly early costs one extra CLI
 * invocation an hour and removes that entire class of flake.
 */
export function refreshingCredentials(profile: string) {
  return async (): Promise<ResolvedCredentials> => {
    const resolved = await credentialsFromCli(profile);
    if (!resolved) {
      throw new Error(
        `could not get credentials for profile "${profile}". The session may have ` +
          "expired — run: aws login --profile " +
          profile,
      );
    }

    return {
      ...resolved,
      ...(resolved.expiration
        ? { expiration: new Date(resolved.expiration.getTime() - 60_000) }
        : {}),
    };
  };
}

/**
 * The credentials option to hand an SDK client, or undefined to leave the SDK's
 * own resolution alone.
 *
 * Undefined is the right answer whenever no profile is configured: the SDK's chain
 * already handles environment variables, instance roles and static keys, and
 * overriding it would break every one of those to serve one local workflow.
 */
export function sdkCredentials(
  env: NodeJS.ProcessEnv = process.env,
): { credentials: ReturnType<typeof refreshingCredentials> } | Record<string, never> {
  const profile = credentialProfile(env);
  if (!profile) return {};

  // Already bridged into the environment by hand: respect that rather than
  // shelling out underneath someone who deliberately set it up.
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return {};

  return { credentials: refreshingCredentials(profile) };
}
