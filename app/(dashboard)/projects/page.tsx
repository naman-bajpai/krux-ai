import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
};

async function getProjects(orgId?: string) {
  return db.project.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { updatedAt: "desc" },
    include: {
      organization: { select: { name: true, plan: true } },
      _count: { select: { migrationObjects: true } },
    },
  });
}

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  const projects = await getProjects(session?.user.organizationId);

  const statusCounts = projects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your SAP migration projects.
          </p>
        </div>
        <CreateProjectDialog orgId={session?.user.organizationId}>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </CreateProjectDialog>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            "ALL",
            "ACTIVE",
            "DRAFT",
            "PAUSED",
            "COMPLETED",
            "ARCHIVED",
          ] as const
        ).map((status) => {
          const count =
            status === "ALL"
              ? projects.length
              : (statusCounts[status] ?? 0);
          return (
            <Badge
              key={status}
              variant={status === "ALL" ? "default" : "outline"}
              className="cursor-pointer hover:bg-accent"
            >
              {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </Badge>
          );
        })}
      </div>

      {/* Projects grid */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
        <FolderKanban className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-lg mb-1">No projects yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Create your first migration project to get started converting your SAP
        objects.
      </p>
      <CreateProjectDialog>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create your first project
        </Button>
      </CreateProjectDialog>
    </div>
  );
}
