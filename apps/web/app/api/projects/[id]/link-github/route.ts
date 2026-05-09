import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  repo_url: z.string().min(1),
  branch: z.string().optional(),
});

const REPO_RE = /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const m = parsed.data.repo_url.trim().match(REPO_RE);
  if (!m) {
    return NextResponse.json({ error: "invalid github repo url" }, { status: 400 });
  }
  const githubRepo = `${m[1]}/${m[2]}`;
  let defaultBranch: string | null = null;

  // Best-effort: validate via GitHub API using the user's GitHub OAuth token
  // (if they signed in with GitHub).
  const token = session?.provider_token;
  if (token) {
    const r = await fetch(`https://api.github.com/repos/${githubRepo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (r.ok) {
      const repo = (await r.json()) as { default_branch: string };
      defaultBranch = repo.default_branch;
    }
  }

  // Default to "main" when neither user-supplied nor probed-from-GitHub branch
  // is available. Mirrored in the UI placeholder for transparency.
  const branch = parsed.data.branch?.trim() || defaultBranch || "main";

  const { data: project, error } = await supabase
    .from("projects")
    .update({
      github_repo: githubRepo,
      github_branch: branch,
      github_default_branch: defaultBranch ?? "main",
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .update({ github_repo: null, github_branch: null, github_default_branch: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
