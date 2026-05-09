"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { NewRuneDialog } from "@/components/new-rune-dialog";
import { Button } from "@/components/ui/button";

export function NewRuneButton({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New rune
      </Button>
      <NewRuneDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectSlug={projectSlug}
      />
    </>
  );
}
