"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/components/providers/project-provider";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateProjectDialogProps {
  children: React.ReactNode;
  orgId?: string;
  /** Controlled open state (optional) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateProjectDialog({
  children,
  orgId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const { setProject } = useProject();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    controlledOnOpenChange?.(v);
  };

  const [form, setForm] = useState({
    name: "",
    description: "",
    sapSystemUrl: "",
    sapRelease: "",
    targetStack: "",
  });

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      toast.success(`Project "${project.name}" created`);
      setOpen(false);
      setForm({ name: "", description: "", sapSystemUrl: "", sapRelease: "", targetStack: "" });
      // Auto-select the new project in the global context
      setProject(project.id, project.name);
      router.push(`/projects/${project.id}`);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate({
      name: form.name,
      description: form.description || undefined,
      sapSystemUrl: form.sapSystemUrl || undefined,
      sapRelease: form.sapRelease || undefined,
      targetStack: form.targetStack || undefined,
      orgId,
    });
  };

  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new SAP migration project. You can add objects and
            configure settings after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="e.g. HR Module Migration"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              minLength={2}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              placeholder="Brief description of this migration"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sap-release">SAP Release</Label>
              <Input
                id="sap-release"
                placeholder="e.g. ECC 6.0"
                value={form.sapRelease}
                onChange={(e) => update("sapRelease", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-stack">Target Stack</Label>
              <Input
                id="target-stack"
                placeholder="e.g. Node.js / React"
                value={form.targetStack}
                onChange={(e) => update("targetStack", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sap-url">SAP System URL</Label>
            <Input
              id="sap-url"
              type="url"
              placeholder="https://sap.yourcompany.com"
              value={form.sapSystemUrl}
              onChange={(e) => update("sapSystemUrl", e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createProject.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.name.trim() || createProject.isPending}
            >
              {createProject.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {createProject.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
