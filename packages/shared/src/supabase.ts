import type {
  GatewayCapabilities,
  GatewayCommandKind,
  GatewayCommandStatus,
  GatewayStatus,
  RuneFrontmatter,
  RuneMessageRole,
  RuneMessageStatus,
  RuneMode,
  RuneStatus,
  RuntimeId,
  TaskPayload,
  TaskStatus,
} from "./types";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface ProjectsTable {
  Row: {
    id: string;
    user_id: string;
    name: string;
    slug: string;
    local_path: string;
    is_external: boolean;
    is_scratch: boolean;
    github_repo: string | null;
    github_branch: string | null;
    github_default_branch: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    name: string;
    slug: string;
    local_path: string;
    is_external?: boolean;
    is_scratch?: boolean;
    github_repo?: string | null;
    github_branch?: string | null;
    github_default_branch?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    name?: string;
    slug?: string;
    local_path?: string;
    is_external?: boolean;
    is_scratch?: boolean;
    github_repo?: string | null;
    github_branch?: string | null;
    github_default_branch?: string | null;
    updated_at?: string;
  };
  Relationships: [];
}

interface RunesTable {
  Row: {
    id: string;
    project_id: string;
    user_id: string;
    slug: string;
    title: string;
    body: string;
    frontmatter: RuneFrontmatter;
    status: RuneStatus;
    runtime: RuntimeId;
    mode: RuneMode;
    output: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    project_id: string;
    user_id: string;
    slug: string;
    title: string;
    body?: string;
    frontmatter: RuneFrontmatter;
    status?: RuneStatus;
    runtime?: RuntimeId;
    mode?: RuneMode;
    output?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    project_id?: string;
    user_id?: string;
    slug?: string;
    title?: string;
    body?: string;
    frontmatter?: RuneFrontmatter;
    status?: RuneStatus;
    runtime?: RuntimeId;
    mode?: RuneMode;
    output?: string | null;
    updated_at?: string;
  };
  Relationships: [];
}

interface RuneMessagesTable {
  Row: {
    id: string;
    rune_id: string;
    user_id: string;
    role: RuneMessageRole;
    content: string;
    status: RuneMessageStatus;
    runtime: RuntimeId | null;
    task_id: string | null;
    error: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    rune_id: string;
    user_id: string;
    role: RuneMessageRole;
    content?: string;
    status?: RuneMessageStatus;
    runtime?: RuntimeId | null;
    task_id?: string | null;
    error?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    content?: string;
    status?: RuneMessageStatus;
    runtime?: RuntimeId | null;
    task_id?: string | null;
    error?: string | null;
    updated_at?: string;
  };
  Relationships: [];
}

interface GatewaysTable {
  Row: {
    id: string;
    user_id: string;
    name: string;
    hostname: string;
    workspace_root: string;
    status: GatewayStatus;
    last_seen_at: string;
    capabilities: GatewayCapabilities;
    client_token: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    name: string;
    hostname: string;
    workspace_root: string;
    status?: GatewayStatus;
    last_seen_at?: string;
    capabilities: GatewayCapabilities;
    client_token?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    name?: string;
    hostname?: string;
    workspace_root?: string;
    status?: GatewayStatus;
    last_seen_at?: string;
    capabilities?: GatewayCapabilities;
    client_token?: string | null;
  };
  Relationships: [];
}

interface TasksTable {
  Row: {
    id: string;
    rune_id: string;
    gateway_id: string | null;
    user_id: string;
    status: TaskStatus;
    runtime: RuntimeId;
    payload: TaskPayload;
    message_id: string | null;
    output: string | null;
    error: string | null;
    created_at: string;
    claimed_at: string | null;
    completed_at: string | null;
  };
  Insert: {
    id?: string;
    rune_id: string;
    gateway_id?: string | null;
    user_id: string;
    status?: TaskStatus;
    runtime: RuntimeId;
    payload: TaskPayload;
    message_id?: string | null;
    output?: string | null;
    error?: string | null;
    created_at?: string;
    claimed_at?: string | null;
    completed_at?: string | null;
  };
  Update: {
    id?: string;
    status?: TaskStatus;
    message_id?: string | null;
    output?: string | null;
    error?: string | null;
    claimed_at?: string | null;
    completed_at?: string | null;
  };
  Relationships: [];
}

interface GatewayCommandsTable {
  Row: {
    id: string;
    user_id: string;
    gateway_id: string;
    kind: GatewayCommandKind;
    payload: Json;
    status: GatewayCommandStatus;
    result: Json | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  };
  Insert: {
    id?: string;
    user_id: string;
    gateway_id: string;
    kind: GatewayCommandKind;
    payload: Json;
    status?: GatewayCommandStatus;
    result?: Json | null;
    error?: string | null;
    created_at?: string;
    completed_at?: string | null;
  };
  Update: {
    id?: string;
    status?: GatewayCommandStatus;
    result?: Json | null;
    error?: string | null;
    completed_at?: string | null;
  };
  Relationships: [];
}

interface UserSettingsTable {
  Row: {
    user_id: string;
    cursor_api_key: string | null;
    username: string | null;
    avatar_url: string | null;
    accent_color: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    user_id: string;
    cursor_api_key?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    accent_color?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    cursor_api_key?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    accent_color?: string | null;
    updated_at?: string;
  };
  Relationships: [];
}

export type Database = {
  public: {
    Tables: {
      projects: ProjectsTable;
      runes: RunesTable;
      rune_messages: RuneMessagesTable;
      gateways: GatewaysTable;
      tasks: TasksTable;
      gateway_commands: GatewayCommandsTable;
      user_settings: UserSettingsTable;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProjectRow = ProjectsTable["Row"];
export type RuneRow = RunesTable["Row"];
export type RuneMessageRow = RuneMessagesTable["Row"];
export type GatewayRow = GatewaysTable["Row"];
export type TaskRow = TasksTable["Row"];
export type GatewayCommandRow = GatewayCommandsTable["Row"];
export type UserSettingsRow = UserSettingsTable["Row"];
