import { localRuntimes } from "@rune/runtimes";
import type { GatewayCapabilities } from "@rune/shared";
import { arch, platform } from "node:os";

export async function detectCapabilities(opts: {
  cursorCloudAvailable: boolean;
}): Promise<GatewayCapabilities> {
  const runtimes = await Promise.all(
    localRuntimes.map(async (r) => ({
      id: r.id,
      available: await r.isAvailable(),
      version: await r.version().catch(() => null),
    })),
  );
  // cursor-cloud availability is determined by whether the user has a key in
  // user_settings — refreshed any time the cache reloads (so capabilities also
  // get re-published whenever the gateway re-registers).
  runtimes.push({
    id: "cursor-cloud",
    available: opts.cursorCloudAvailable,
    version: opts.cursorCloudAvailable ? "cloud" : null,
  });
  return {
    runtimes,
    os: platform(),
    arch: arch(),
    bun_version: typeof Bun !== "undefined" ? Bun.version : undefined,
  };
}
