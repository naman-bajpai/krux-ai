import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderKanban,
  MoreHorizontal,
  GitMerge,
  ExternalLink,
  Settings,
  Archive,
  Play,
} from "lucide-react";
import { formatDate, getStatusColor } from "@/lib/utils";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    sapSystemUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    organization: { name: string; plan: string };
    _count: { migrationObjects: number };
  };
}

const planColors: Record<string, string> = {
  ASSESSMENT: "bg-slate-100 text-slate-700",
  MIGRATION: "bg-secondary text-secondary-foreground",
  ENTERPRISE: "bg-muted text-muted-foreground",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const progress = 0; // TODO: calculate from actual stats

  return (
    <Card className="group flex flex-col hover:shadow-md transition-shadow duration-200">
      <CardContent className="pt-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <Link
                href={`/projects/${project.id}`}
                className="text-sm font-semibold hover:text-primary transition-colors truncate block"
              >
                {project.name}
              </Link>
              <p className="text-xs text-muted-foreground truncate">
                {project.organization.name}
              </p>
            </div>
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/migration?projectId=${project.id}`}>
                  <Play className="h-4 w-4" />
                  Run Migration
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Open Project
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}/settings`}>
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-muted-foreground">
                <Archive className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {project.description}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <GitMerge className="h-3.5 w-3.5" />
            {project._count.migrationObjects} objects
          </span>
          <span>·</span>
          <span>Updated {formatDate(project.updatedAt)}</span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">{progress}% complete</p>
        </div>
      </CardContent>

      <CardFooter className="pt-0 pb-4 px-5 gap-2">
        {/* Status badge */}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}
        >
          {project.status.charAt(0) + project.status.slice(1).toLowerCase()}
        </span>

        {/* Plan badge */}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${planColors[project.organization.plan] ?? "bg-slate-100 text-slate-700"}`}
        >
          {project.organization.plan}
        </span>
      </CardFooter>
    </Card>
  );
}
