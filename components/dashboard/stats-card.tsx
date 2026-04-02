import Link from "next/link";
import {
  FolderKanban,
  GitMerge,
  CheckCircle2,
  TrendingUp,
  Clock,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardStatsProps {
  projectCount: number;
  totalObjects: number;
  approvedObjects: number;
  convertedObjects: number;
  pendingObjects: number;
  completionRate: number;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  href?: string;
  accentClass: string;
  subValue?: string;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  accentClass,
  subValue,
}: StatCardProps) {
  const inner = (
    <Card
      className={cn(
        "overflow-hidden relative transition-all duration-200",
        href && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accentClass)} />
      <CardContent className="pt-5 pb-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5">
              {title}
            </p>
            <p className="text-3xl font-mono font-bold leading-none tracking-tight">
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
              {description}
            </p>
            {subValue && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                {subValue}
              </p>
            )}
          </div>
          <div className="shrink-0 mt-0.5">
            <Icon className="h-5 w-5 text-muted-foreground/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function DashboardStats({
  projectCount,
  totalObjects,
  approvedObjects,
  convertedObjects,
  pendingObjects,
  completionRate,
}: DashboardStatsProps) {
  const awaitingReview = convertedObjects;

  const stats: StatCardProps[] = [
    {
      title: "Projects",
      value: projectCount,
      description: "Active migration projects",
      icon: FolderKanban,
      href: "/projects",
      accentClass: "bg-foreground/25",
    },
    {
      title: "Total Objects",
      value: totalObjects.toLocaleString(),
      description:
        pendingObjects > 0
          ? `${pendingObjects.toLocaleString()} pending conversion`
          : "All objects enqueued or processed",
      icon: GitMerge,
      href: "/migration",
      accentClass: "bg-blue-500",
    },
    {
      title: "Approved",
      value: approvedObjects.toLocaleString(),
      description: "Production-ready objects",
      icon: CheckCircle2,
      href: "/migration",
      accentClass: "bg-emerald-500",
      subValue:
        awaitingReview > 0
          ? `${awaitingReview} awaiting review`
          : undefined,
    },
    {
      title: "Completion",
      value: `${completionRate}%`,
      description:
        completionRate === 100
          ? "Migration complete"
          : completionRate > 0
          ? "Of objects approved"
          : "No approvals yet",
      icon: TrendingUp,
      href: "/analytics",
      accentClass:
        completionRate >= 75
          ? "bg-emerald-500"
          : completionRate >= 40
          ? "bg-amber-500"
          : "bg-foreground/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
