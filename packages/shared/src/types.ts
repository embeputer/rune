import { z } from "zod";

export const RUNTIME_IDS = [
  "cursor-agent",
  "claude-code",
  "codex",
  "droid",
  "cursor-cloud",
] as const;

export const RuntimeIdSchema = z.enum(RUNTIME_IDS);
export type RuntimeId = z.infer<typeof RuntimeIdSchema>;

export const LOCAL_RUNTIME_IDS: RuntimeId[] = ["cursor-agent", "claude-code", "codex", "droid"];
export const CLOUD_RUNTIME_IDS: RuntimeId[] = ["cursor-cloud"];

export const RUNTIME_LABELS: Record<RuntimeId, string> = {
  "cursor-agent": "Cursor Agent",
  "claude-code": "Claude Code",
  codex: "Codex",
  droid: "Droid",
  "cursor-cloud": "Cursor Cloud",
};

export const RuneStatusSchema = z.enum(["idle", "queued", "running", "done", "error"]);
export type RuneStatus = z.infer<typeof RuneStatusSchema>;

export const RuneModeSchema = z.enum(["doc", "chat"]);
export type RuneMode = z.infer<typeof RuneModeSchema>;

export const RuneMessageRoleSchema = z.enum(["user", "assistant"]);
export type RuneMessageRole = z.infer<typeof RuneMessageRoleSchema>;

export const RuneMessageStatusSchema = z.enum(["pending", "streaming", "done", "error"]);
export type RuneMessageStatus = z.infer<typeof RuneMessageStatusSchema>;

export const TaskStatusSchema = z.enum(["queued", "running", "done", "error", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const GatewayStatusSchema = z.enum(["online", "offline"]);
export type GatewayStatus = z.infer<typeof GatewayStatusSchema>;

export const GatewayCommandKindSchema = z.enum([
  "pick-folder",
  "import-folder",
  "relocate-project",
  "scan-folder",
  "sign-out",
]);
export type GatewayCommandKind = z.infer<typeof GatewayCommandKindSchema>;

export const GatewayCommandStatusSchema = z.enum(["queued", "running", "done", "error"]);
export type GatewayCommandStatus = z.infer<typeof GatewayCommandStatusSchema>;

export const RuneFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  runtime: RuntimeIdSchema.default("cursor-agent"),
  status: RuneStatusSchema.default("idle"),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type RuneFrontmatter = z.infer<typeof RuneFrontmatterSchema>;

export const GatewayCapabilitiesSchema = z.object({
  runtimes: z.array(
    z.object({
      id: RuntimeIdSchema,
      available: z.boolean(),
      version: z.string().nullable().optional(),
    }),
  ),
  os: z.string(),
  arch: z.string(),
  bun_version: z.string().optional(),
});
export type GatewayCapabilities = z.infer<typeof GatewayCapabilitiesSchema>;

export const TaskPayloadSchema = z.object({
  prompt: z.string(),
  cwd: z.string().optional(),
  github_repo: z.string().nullable().optional(),
  github_branch: z.string().nullable().optional(),
});
export type TaskPayload = z.infer<typeof TaskPayloadSchema>;

export const PickFolderPayloadSchema = z.object({
  title: z.string().optional(),
});

export const ImportFolderPayloadSchema = z.object({
  path: z.string(),
  name: z.string().optional(),
});

export const RelocateProjectPayloadSchema = z.object({
  project_id: z.string().uuid(),
  dest_path: z.string(),
});

export const ScanFolderPayloadSchema = z.object({
  project_id: z.string().uuid(),
});

export const GatewayCommandPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pick-folder"), data: PickFolderPayloadSchema }),
  z.object({ kind: z.literal("import-folder"), data: ImportFolderPayloadSchema }),
  z.object({ kind: z.literal("relocate-project"), data: RelocateProjectPayloadSchema }),
  z.object({ kind: z.literal("scan-folder"), data: ScanFolderPayloadSchema }),
]);
export type GatewayCommandPayload = z.infer<typeof GatewayCommandPayloadSchema>;

