"use client";

import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function AvatarCard({
  initialUrl,
  userId,
  fallbackInitial,
}: {
  initialUrl: string | null;
  userId: string;
  fallbackInitial: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Use a PNG, JPG, WebP, or GIF image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 4MB or smaller");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const res = await fetch("/api/account/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");

      setUrl(publicUrl);
      toast.success("Profile picture updated");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove your profile picture?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      setUrl(null);
      toast.success("Profile picture removed");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-[var(--color-fg-muted)]" />
        <h2 className="text-sm font-semibold">Profile picture</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elev-2)]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--color-accent)] text-xl font-semibold text-[var(--color-accent-fg)]">
              {fallbackInitial.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-xs text-[var(--color-fg-muted)]">
            PNG, JPG, WebP or GIF. Up to 4 MB. Shown in the sidebar header.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <Upload className="h-3.5 w-3.5" />
              {busy ? "Uploading…" : url ? "Replace" : "Upload"}
            </Button>
            {url && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={remove}
                disabled={busy}
                className="text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED.join(",")}
        onChange={onFile}
        className="hidden"
      />
    </section>
  );
}
