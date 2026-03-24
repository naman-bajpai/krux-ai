/**
 * GET /api/projects/:projectId/export?format=zip|json&status=APPROVED
 *
 * Streams a ZIP (or JSON) archive of all migration objects for the project.
 * Defaults to APPROVED objects only; pass ?status=ALL to include everything.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import JSZip from "jszip";

// Map ObjectType → abapGit file extension
const EXT_MAP: Record<string, string> = {
  CLASS:           "clas.abap",
  INTERFACE:       "intf.abap",
  FUNCTION_MODULE: "func.abap",
  REPORT:          "prog.abap",
  PROGRAM:         "prog.abap",
  INCLUDE:         "incl.abap",
  TABLE:           "tabl.abap",
  VIEW:            "view.abap",
  DATA_ELEMENT:    "dtel.abap",
  DOMAIN:          "doma.abap",
  METHOD:          "meth.abap",
  FORM_ROUTINE:    "form.abap",
};

function objectFileName(name: string, type: string): string {
  const ext = EXT_MAP[type] ?? "abap";
  return `${name}.${ext}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = params;
  const { searchParams } = request.nextUrl;
  const format = searchParams.get("format") ?? "zip";
  const statusFilter = searchParams.get("status") ?? "APPROVED";

  // ── Load project (verify ownership) ────────────────────────────────────────
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { organization: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Users must belong to the same org (or be an admin)
  const isAdmin = session.user.role === "ADMIN";
  const sameOrg = session.user.organizationId === project.orgId;
  if (!isAdmin && !sameOrg) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch objects ───────────────────────────────────────────────────────────
  const where =
    statusFilter === "ALL"
      ? { projectId }
      : { projectId, status: statusFilter as any };

  const objects = await db.migrationObject.findMany({
    where,
    orderBy: [{ objectType: "asc" }, { objectName: "asc" }],
    select: {
      objectName: true,
      objectType: true,
      packageName: true,
      sourceCode: true,
      convertedCode: true,
      confidenceScore: true,
      status: true,
      processingTime: true,
      tokenCount: true,
    },
  });

  if (objects.length === 0) {
    return NextResponse.json(
      { error: "No objects found for the given filter" },
      { status: 404 },
    );
  }

  const slug = project.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);

  // ── JSON export ─────────────────────────────────────────────────────────────
  if (format === "json") {
    const payload = {
      project: {
        id: project.id,
        name: project.name,
        sapRelease: project.sapRelease,
        targetStack: project.targetStack,
        exportedAt: new Date().toISOString(),
        exportedBy: session.user.email,
      },
      objects: objects.map((o) => ({
        objectName: o.objectName,
        objectType: o.objectType,
        packageName: o.packageName,
        status: o.status,
        confidenceScore: o.confidenceScore
          ? Math.round(o.confidenceScore * 100)
          : null,
        processingTimeMs: o.processingTime,
        tokenCount: o.tokenCount,
        sourceCode: o.sourceCode,
        convertedCode: o.convertedCode,
      })),
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slug}_export_${dateStr}.json"`,
      },
    });
  }

  // ── ZIP export (default) ────────────────────────────────────────────────────
  const zip = new JSZip();

  // Folder: converted/<ObjectType>/
  for (const obj of objects) {
    const code = obj.convertedCode ?? obj.sourceCode; // fall back to source if not converted
    const folder = zip.folder(obj.objectType.toLowerCase()) as JSZip;
    folder.file(objectFileName(obj.objectName, obj.objectType), code);
  }

  // Manifest: summary of what's in the ZIP
  const manifest = [
    `# Krux AI – Migration Export`,
    `Project : ${project.name}`,
    `Exported: ${new Date().toISOString()}`,
    `By      : ${session.user.email}`,
    `Filter  : status=${statusFilter}`,
    `Objects : ${objects.length}`,
    ``,
    `Object Name                    | Type            | Status    | Confidence`,
    `-------------------------------|-----------------|-----------|------------`,
    ...objects.map((o) => {
      const conf = o.confidenceScore
        ? `${Math.round(o.confidenceScore * 100)}%`
        : "n/a";
      return `${o.objectName.padEnd(30)} | ${o.objectType.padEnd(15)} | ${o.status.padEnd(9)} | ${conf}`;
    }),
  ].join("\n");

  zip.file("MANIFEST.txt", manifest);

  // Audit log
  await db.auditLog.create({
    data: {
      projectId,
      userId: session.user.id,
      action: "PROJECT_EXPORTED",
      metadata: {
        format,
        statusFilter,
        objectCount: objects.length,
      },
    },
  });

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}_converted_${dateStr}.zip"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}
