"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Plus, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ProjectStatus } from "@prisma/client";

const STATUS_FILTERS = [
  "ALL", "ACTIVE", "DRAFT", "PAUSED", "COMPLETED", "ARCHIVED",
] as const;
type Filter = typeof STATUS_FILTERS[number];

export default function ProjectsPage() {
  const { data: session } = useSession();
  const [activeFilter, setActiveFilter] = useState<Filter>("ALL");

  // Filtered list
  const { data, isLoading, refetch } = trpc.project.list.useQuery(
    {
      limit: 50,
      status: activeFilter === "ALL" ? undefined : (activeFilter as ProjectStatus),
    },
    { placeholderData: (prev: any) => prev }
  );

  // Full list for counts (separate query, cached)
  const { data: allData } = trpc.project.list.useQuery({ limit: 50 });

  const projects = data?.projects ?? [];
  const allProjects = allData?.projects ?? [];
  const statusCounts = allProjects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const afterCreate = () => refetch();

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your SAP migration projects.
          </p>
        </div>
        <CreateProjectDialog
          orgId={session?.user?.organizationId}
          onOpenChange={(v) => { if (!v) afterCreate(); }}
        >
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </CreateProjectDialog>
      </div>

      {/* Status filter badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((status) => {
          const count =
            status === "ALL"
              ? allProjects.length
              : (statusCounts[status] ?? 0);
          const active = activeFilter === status;
          return (
            <Badge
              key={status}
              variant={active ? "default" : "outline"}
              className={cn(
                "cursor-pointer select-none transition-colors",
                !active && "hover:bg-accent"
              )}
              onClick={() => setActiveFilter(status)}
            >
              {status === "ALL"
                ? "All"
                : status.charAt(0) + status.slice(1).toLowerCase()}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </Badge>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <FolderKanban className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">
            {activeFilter === "ALL"
              ? "No projects yet"
              : `No ${activeFilter.toLowerCase()} projects`}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {activeFilter === "ALL"
              ? "Create your first migration project to get started."
              : `Switch the filter to see projects with a different status.`}
          </p>
          {activeFilter === "ALL" && (
            <CreateProjectDialog
              orgId={session?.user?.organizationId}
              onOpenChange={(v) => { if (!v) afterCreate(); }}
            >
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create your first project
              </Button>
            </CreateProjectDialog>
          )}
        </div>
      )}

      {/* Projects grid */}
      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
