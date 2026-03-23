import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, ArrowRight, GitMerge } from "lucide-react";
import { formatDate, getStatusColor } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
  organization: { name: string };
  _count: { migrationObjects: number };
}

interface RecentProjectsProps {
  projects: Project[];
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
          <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
            <Link href="/projects">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center px-6">
            <FolderKanban className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Create your first migration project.
            </p>
            <Button size="sm" asChild>
              <Link href="/projects">Get Started</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors group"
              >
                {/* Project icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {project.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {project.organization.name} · Updated {formatDate(project.updatedAt)}
                  </p>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                    <GitMerge className="h-3.5 w-3.5" />
                    <span>{project._count.migrationObjects}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}
                  >
                    {project.status.charAt(0) +
                      project.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
