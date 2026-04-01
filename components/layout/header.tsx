"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  User,
  Building2,
  Plus,
  Search,
  Check,
  FolderKanban,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useProject } from "@/components/providers/project-provider";
import { cn } from "@/lib/utils";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user;

  const { projectId, projectName, setProject, clearProject } = useProject();

  // Fetch project list for switcher
  const { data: projectList } = trpc.project.list.useQuery(
    { limit: 20 },
    { staleTime: 30_000 }
  );

  const handleSelectProject = (id: string, name: string) => {
    setProject(id, name);
    // Navigate to this project's migration workspace
    router.push(`/migration?projectId=${id}`);
  };

  return (
    <header className="abstract-topbar flex h-14 shrink-0 items-center gap-3 px-4">
      {/* Project Switcher */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-xl px-3 text-sm font-medium max-w-[260px]"
            >
              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">
                {projectName ?? "Select Project"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Projects</span>
              {projectId && (
                <button
                  onClick={clearProject}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Action items */}
            <DropdownMenuItem onClick={() => router.push("/projects/new")}>
              <Plus className="h-4 w-4" />
              New project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/projects")}>
              <Building2 className="h-4 w-4" />
              View all projects
            </DropdownMenuItem>

            {/* Project list */}
            {projectList?.projects && projectList.projects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                  Recent
                </DropdownMenuLabel>
                {projectList.projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => handleSelectProject(p.id, p.name)}
                    className="flex items-center gap-2 pr-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.organization?.name ?? "Personal"} ·{" "}
                        <span className={cn(
                          p.status === "ACTIVE" && "text-green-600 dark:text-green-400",
                          p.status === "DRAFT" && "text-muted-foreground",
                          p.status === "PAUSED" && "text-yellow-600 dark:text-yellow-400",
                        )}>
                          {p.status}
                        </span>
                      </p>
                    </div>
                    {p.id === projectId && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Active project badge (quick nav) */}
        {projectId && (
          <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground">
            <span className="text-xs">/</span>
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[140px]"
            >
              {projectName}
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <Button
        variant="outline"
        className="abstract-input hidden h-9 w-56 justify-start gap-2 rounded-xl text-sm font-normal text-muted-foreground shadow-none md:flex"
        onClick={() => { /* TODO: command palette */ }}
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
      </Button>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 gap-2 rounded-xl px-3"
            aria-label="User menu"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
              <AvatarFallback className="text-xs">
                {getInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-xs font-medium leading-none">
                {user?.name ?? user?.email}
              </span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {user?.role}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="font-normal py-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Role:</span>
              <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                {user?.role}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
