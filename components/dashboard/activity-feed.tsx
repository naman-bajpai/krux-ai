import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Activity } from "lucide-react";
import { formatRelativeTime, getInitials } from "@/lib/utils";

interface AuditLog {
  id: string;
  action: string;
  timestamp: Date;
  metadata: unknown;
  user: { name: string | null; email: string | null; image: string | null };
  project: { name: string } | null;
}

interface ActivityFeedProps {
  activities: AuditLog[];
}

const actionLabels: Record<string, string> = {
  USER_REGISTERED: "joined the platform",
  PROJECT_CREATED: "created a project",
  PROJECT_UPDATED: "updated a project",
  OBJECTS_UPLOADED: "uploaded objects",
  CONVERSION_ENQUEUED: "queued objects for conversion",
  OBJECT_CONVERTED: "converted an object",
  REVIEW_SUBMITTED: "submitted a review",
};

function ActionLabel({ action, projectName }: { action: string; projectName?: string }) {
  const label = actionLabels[action] ?? action.toLowerCase().replace(/_/g, " ");
  return (
    <span>
      {label}
      {projectName && (
        <>
          {" "}
          in <span className="font-medium">{projectName}</span>
        </>
      )}
    </span>
  );
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center px-6">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          </div>
        ) : (
          <div className="divide-y">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 px-6 py-3"
              >
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarImage
                    src={activity.user.image ?? ""}
                    alt={activity.user.name ?? ""}
                  />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(activity.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed">
                    <span className="font-medium">
                      {activity.user.name ?? activity.user.email ?? "Someone"}
                    </span>{" "}
                    <ActionLabel
                      action={activity.action}
                      projectName={activity.project?.name}
                    />
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatRelativeTime(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
