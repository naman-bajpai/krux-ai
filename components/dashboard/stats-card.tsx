import {
  FolderKanban,
  GitMerge,
  CheckCircle2,
  TrendingUp,
  Clock,
  Zap,
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
  trend?: { value: number; label: string };
  colorClass: string;
  bgClass: string;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  colorClass,
  bgClass,
}: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              bgClass
            )}
          >
            <Icon className={cn("h-5 w-5", colorClass)} />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {trend.value}%
            </span>
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardStats({
  projectCount,
  totalObjects,
  approvedObjects,
  convertedObjects,
  pendingObjects,
  completionRate,
}: DashboardStatsProps) {
  const stats: StatCardProps[] = [
    {
      title: "Total Projects",
      value: projectCount,
      description: "Active migration projects",
      icon: FolderKanban,
      colorClass: "text-foreground",
      bgClass: "bg-muted",
    },
    {
      title: "Migration Objects",
      value: totalObjects.toLocaleString(),
      description: `${pendingObjects} pending conversion`,
      icon: GitMerge,
      colorClass: "text-foreground",
      bgClass: "bg-muted",
    },
    {
      title: "Approved",
      value: approvedObjects.toLocaleString(),
      description: `${convertedObjects} awaiting review`,
      icon: CheckCircle2,
      colorClass: "text-foreground",
      bgClass: "bg-muted",
    },
    {
      title: "Completion Rate",
      value: `${completionRate}%`,
      description: "Objects approved vs total",
      icon: Zap,
      colorClass: "text-foreground",
      bgClass: "bg-muted",
      ...(completionRate > 0 && {
        trend: { value: completionRate, label: "completion" },
      }),
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
