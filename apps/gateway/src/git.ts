import { spawn } from "node:child_process";

export interface ProjectLookup {
  id: string;
  localPath: string;
  githubRepo: string | null;
  githubDefaultBranch: string | null;
}

export interface GitFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  diff: string;
  isRepo: boolean;
}

export interface CommitResult {
  ok: boolean;
  sha?: string;
  output: string;
}

export interface PullRequestInput {
  title: string;
  body: string;
  base: string | null;
  head: string | null;
  githubToken: string | null;
}

export interface PullRequestResult {
  url: string | null;
  number: number | null;
  via: "github-rest" | "gh-cli";
  raw?: unknown;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

export async function gitStatus(project: ProjectLookup): Promise<GitStatus> {
  const branchRes = await run("git", ["-C", project.localPath, "rev-parse", "--is-inside-work-tree"], project.localPath);
  if (branchRes.code !== 0) {
    return { branch: null, ahead: 0, behind: 0, files: [], diff: "", isRepo: false };
  }

  const status = await run(
    "git",
    ["-C", project.localPath, "status", "--porcelain=v2", "--branch"],
    project.localPath,
  );
  if (status.code !== 0) {
    throw new Error(status.stderr.trim() || "git status failed");
  }

  const { branch, ahead, behind, files } = parsePorcelainV2(status.stdout);

  // Combined diff: staged + unstaged + untracked (new files via /dev/null diff).
  const [unstaged, staged] = await Promise.all([
    run("git", ["-C", project.localPath, "diff", "--no-color"], project.localPath),
    run("git", ["-C", project.localPath, "diff", "--cached", "--no-color"], project.localPath),
  ]);
  let diff = "";
  if (staged.stdout) diff += staged.stdout;
  if (unstaged.stdout) diff += (diff ? "\n" : "") + unstaged.stdout;
  for (const f of files) {
    if (f.status === "??") {
      const synthetic = await run(
        "git",
        ["-C", project.localPath, "diff", "--no-color", "--no-index", "/dev/null", f.path],
        project.localPath,
      );
      if (synthetic.stdout) diff += (diff ? "\n" : "") + synthetic.stdout;
    }
  }

  return { branch, ahead, behind, files, diff, isRepo: true };
}

function parsePorcelainV2(out: string) {
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFile[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length).trim();
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      // format: "# branch.ab +N -M"
      const rest = line.slice("# branch.ab ".length).trim().split(/\s+/);
      for (const tok of rest) {
        if (tok.startsWith("+")) ahead = Number(tok.slice(1)) || 0;
        else if (tok.startsWith("-")) behind = Number(tok.slice(1)) || 0;
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    if (line.startsWith("? ")) {
      files.push({ path: line.slice(2), status: "??", staged: false });
      continue;
    }
    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // 1 XY <sub> <mH> <mI> <mW> <hH> <hI> <path>
      // 2 XY <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>\t<origPath>
      const parts = line.split(" ");
      const xy = parts[1] ?? "..";
      const isRename = line.startsWith("2 ");
      const startIndex = isRename ? 9 : 8;
      const rest = parts.slice(startIndex).join(" ");
      const path = isRename ? rest.split("\t")[0] ?? rest : rest;
      const X = xy[0] ?? ".";
      const Y = xy[1] ?? ".";
      const staged = X !== "." && X !== "?";
      files.push({ path, status: `${X}${Y}`, staged });
      continue;
    }
    if (line.startsWith("u ")) {
      // unmerged: u XY <sub> ... <path>
      const parts = line.split(" ");
      const xy = parts[1] ?? "UU";
      const path = parts.slice(10).join(" ");
      files.push({ path, status: xy, staged: false });
    }
  }
  return { branch, ahead, behind, files };
}

export async function commitChanges(
  project: ProjectLookup,
  message: string,
  files: string[] | undefined,
): Promise<CommitResult> {
  if (files && files.length > 0) {
    const add = await run(
      "git",
      ["-C", project.localPath, "add", "--", ...files],
      project.localPath,
    );
    if (add.code !== 0) throw new Error(add.stderr.trim() || "git add failed");
  } else {
    const add = await run("git", ["-C", project.localPath, "add", "-A"], project.localPath);
    if (add.code !== 0) throw new Error(add.stderr.trim() || "git add failed");
  }
  const commit = await run(
    "git",
    ["-C", project.localPath, "commit", "-m", message],
    project.localPath,
  );
  if (commit.code !== 0) {
    throw new Error(commit.stderr.trim() || commit.stdout.trim() || "git commit failed");
  }
  const sha = await run("git", ["-C", project.localPath, "rev-parse", "HEAD"], project.localPath);
  return {
    ok: true,
    sha: sha.code === 0 ? sha.stdout.trim() : undefined,
    output: commit.stdout,
  };
}

export async function openPullRequest(
  project: ProjectLookup,
  input: PullRequestInput,
): Promise<PullRequestResult> {
  if (!project.githubRepo) {
    throw new Error("project has no github_repo linked");
  }
  const head =
    input.head ??
    (await run("git", ["-C", project.localPath, "branch", "--show-current"], project.localPath))
      .stdout.trim();
  if (!head) throw new Error("could not determine current branch");
  const base = input.base ?? project.githubDefaultBranch ?? "main";

  // Make sure the head branch is on the remote so GitHub can create the PR.
  const push = await run(
    "git",
    ["-C", project.localPath, "push", "-u", "origin", head],
    project.localPath,
  );
  if (push.code !== 0 && !/everything up-to-date/i.test(push.stderr)) {
    // If push truly failed (auth, etc), surface but still try GitHub call —
    // user may have pushed manually.
    console.warn("[git] push warning:", push.stderr.trim());
  }

  if (input.githubToken) {
    const [owner, repo] = project.githubRepo.split("/");
    if (!owner || !repo) throw new Error(`invalid github_repo: ${project.githubRepo}`);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head,
        base,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      html_url?: string;
      number?: number;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(json?.message ?? `GitHub returned ${res.status}`);
    }
    return {
      url: json.html_url ?? null,
      number: typeof json.number === "number" ? json.number : null,
      via: "github-rest",
      raw: json,
    };
  }

  // Fallback: use gh CLI if installed.
  const gh = await run(
    "gh",
    [
      "pr",
      "create",
      "--title",
      input.title,
      "--body",
      input.body,
      "--base",
      base,
      "--head",
      head,
    ],
    project.localPath,
  );
  if (gh.code !== 0) {
    throw new Error(
      gh.stderr.trim() ||
        "no github token provided and `gh` CLI failed (install gh or sign in with GitHub)",
    );
  }
  const url = gh.stdout.trim().split(/\s+/).pop() ?? null;
  return { url, number: null, via: "gh-cli" };
}
