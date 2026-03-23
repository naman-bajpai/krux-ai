import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  GitMerge,
  BarChart3,
  Settings,
  Play,
} from "lucide-react";
import { formatDate, getStatusColor } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { name: true },
  });
  return { title: project?.name ?? "Project" };
}

async function getProjectDetails(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      organization: true,
      _count: { select: { migrationObjects: true, auditLogs: true } },
    },
  });

  if (!project) return null;

  const [statusBreakdown, recentObjects] = await Promise.all([
    db.migrationObject.groupBy({
      by: ["status"],
      where: { projectId: id },
      _count: { status: true },
    }),
    db.migrationObject.findMany({
      where: { projectId: id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        objectName: true,
        objectType: true,
        status: true,
        confidenceScore: true,
        updatedAt: true,
      },
    }),
  ]);

  const stats = Object.fromEntries(
    statusBreakdown.map((s: any) => [s.status, s._count.status])
  );

  return { project, stats, recentObjects };
}

export default async function ProjectDetailPage({ params }: Props) {
  const data = await getProjectDetails(params.id);
  if (!data) notFound();

  const { project, stats, recentObjects } = data;
  const totalObjects = project._count.migrationObjects;
  const approvedCount = stats["APPROVED"] ?? 0;
  const progress = totalObjects > 0 ? (approvedCount / totalObjects) * 100 : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back link + header */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Projects
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}
              >
                {project.status}
              </span>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Created {formatDate(project.createdAt)} ·{" "}
              {project.organization.name}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/migration?projectId=${project.id}`}>
                <Play className="h-4 w-4" />
                Run Migration
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm font-semibold text-primary">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {approvedCount} of {totalObjects} objects approved
          </p>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Objects",
            value: totalObjects,
            icon: GitMerge,
            color: "text-blue-500",
          },
          {
            label: "Converted",
            value: stats["CONVERTED"] ?? 0,
            icon: BarChart3,
            color: "text-purple-500",
          },
          {
            label: "Pending Review",
            value: (stats["CONVERTED"] ?? 0) + (stats["REVIEWED"] ?? 0),
            icon: Clock,
            color: "text-yellow-500",
          },
          {
            label: "Approved",
            value: approvedCount,
            icon: CheckCircle2,
            color: "text-green-500",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent objects */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Objects</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/migration?projectId=${project.id}`}>
                View all
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentObjects.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No objects yet. Start by uploading ABAP source files.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {recentObjects.map((obj: any) => (
                <div
                  key={obj.id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {obj.objectName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {obj.objectType}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {obj.confidenceScore !== null && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(obj.confidenceScore * 100)}%
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(obj.status)}`}
                    >
                      {obj.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "SAP System URL", value: project.sapSystemUrl ?? "—" },
            { label: "SAP Release", value: project.sapRelease ?? "—" },
            { label: "Target Stack", value: project.targetStack ?? "—" },
            {
              label: "Organization",
              value: project.organization.name,
            },
            {
              label: "Plan",
              value: project.organization.plan,
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
