import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, ArrowRight, GitMerge, Plus } from "lucide-react";
import { formatDate, getStatusColor, cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
  organization: { name: string };
  _count: { migrationObjects: number };
  approvedCount?: number;
}

interface RecentProjectsProps {
  projects: Project[];
}

function ProjectProgressBar({
  total,
  approved,
}: {
  total: number;
  approved: number;
}) {
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right shrink-0">
        {pct}%
      </span>
    </div>
  );
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            Recent Projects
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
              <Link href="/projects/new">
                <Plus className="h-3.5 w-3.5" />
                New
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
              <Link href="/projects">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center px-6">
            <FolderKanban className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Create your first migration project to get started.
            </p>
            <Button size="sm" asChild>
              <Link href="/projects/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create Project
              </Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {projects.map((project) => {
              const total = project._count.migrationObjects;
              const approved = project.approvedCount ?? 0;

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors group"
                >
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background group-hover:border-primary/30 transition-colors">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Info + progress */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {project.organization.name} · Updated{" "}
                      {formatDate(project.updatedAt)}
                    </p>
                    {total > 0 && (
                      <ProjectProgressBar total={total} approved={approved} />
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        getStatusColor(project.status)
                      )}
                    >
                      {project.status.charAt(0) +
                        project.status.slice(1).toLowerCase()}
                    </span>
                    {total > 0 && (
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                        <GitMerge className="h-3 w-3" />
                        {total}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
