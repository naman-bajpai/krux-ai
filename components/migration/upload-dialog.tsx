"use client";

import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ObjectType } from "@prisma/client";
import {
  Upload,
  FileCode,
  Trash2,
  Plus,
  Loader2,
  CheckCircle,
} from "lucide-react";

// ─── ABAP Type Detection ───────────────────────────────────────────────────────

const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  REPORT: "Report",
  PROGRAM: "Program",
  FUNCTION_MODULE: "Function Group",
  CLASS: "Class",
  INTERFACE: "Interface",
  TABLE: "Table",
  VIEW: "View",
  DATA_ELEMENT: "Data Element",
  DOMAIN: "Domain",
  INCLUDE: "Include",
  METHOD: "Method",
  FORM_ROUTINE: "Form Routine",
};

/**
 * Detect ABAP object type from file name and source code content.
 * Follows abapGit file naming conventions where possible.
 */
function detectObjectType(filename: string, source: string): ObjectType {
  const lower = filename.toLowerCase();
  // abapGit naming: name.type.abap
  if (lower.includes(".prog.")) return ObjectType.PROGRAM;
  if (lower.includes(".fugr.")) return ObjectType.FUNCTION_MODULE;
  if (lower.includes(".clas.")) return ObjectType.CLASS;
  if (lower.includes(".intf.")) return ObjectType.INTERFACE;
  if (lower.includes(".tabl.")) return ObjectType.TABLE;
  if (lower.includes(".view.")) return ObjectType.VIEW;
  if (lower.includes(".dtel.")) return ObjectType.DATA_ELEMENT;
  if (lower.includes(".doma.")) return ObjectType.DOMAIN;
  if (lower.includes(".incl.")) return ObjectType.INCLUDE;

  // Content-based detection
  const src = source.toUpperCase();
  if (/^\s*FUNCTION-POOL\s/m.test(src)) return ObjectType.FUNCTION_MODULE;
  if (/^\s*FUNCTION\s+\w/m.test(src)) return ObjectType.FUNCTION_MODULE;
  if (/^\s*CLASS\s+\w.*DEFINITION/m.test(src)) return ObjectType.CLASS;
  if (/^\s*INTERFACE\s+\w/m.test(src)) return ObjectType.INTERFACE;
  if (/^\s*(REPORT|PROGRAM)\s/m.test(src)) return ObjectType.PROGRAM;
  if (/^\s*INCLUDE\s+\w/m.test(src)) return ObjectType.INCLUDE;

  return ObjectType.PROGRAM; // sensible default
}

/**
 * Derive a clean object name from the file name.
 * Strips extensions (.abap, .prog, .clas, etc.) and uppercases.
 */
function deriveObjectName(filename: string): string {
  // Strip all extensions: e.g., "ZCL_FOO.clas.abap" → "ZCL_FOO"
  const base = filename.replace(/(\.\w+)+$/, "");
  return base.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 200);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedObject {
  key: string; // unique per row
  objectType: ObjectType;
  objectName: string;
  packageName: string;
  sourceCode: string;
  filename: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

export function UploadDialog({ projectId, open, onOpenChange, onUploaded }: Props) {
  const [objects, setObjects] = useState<ParsedObject[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<"files" | "paste">("files");
  const [pasteSource, setPasteSource] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [pasteType, setPasteType] = useState<ObjectType>(ObjectType.FUNCTION_MODULE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = trpc.migration.uploadObjects.useMutation({
    onSuccess: (result) => {
      toast.success(`Uploaded ${result.created} object${result.created === 1 ? "" : "s"}`);
      setObjects([]);
      setPasteSource("");
      setPasteName("");
      onUploaded();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── File parsing ────────────────────────────────────────────────────────────

  const parseFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) =>
        f.name.endsWith(".abap") ||
        f.name.endsWith(".txt") ||
        f.type === "text/plain" ||
        f.type === "",
    );

    if (fileArray.length === 0) {
      toast.error("Only .abap or .txt files are supported");
      return;
    }

    const parsed: ParsedObject[] = await Promise.all(
      fileArray.map(async (file) => {
        const sourceCode = await file.text();
        const objectType = detectObjectType(file.name, sourceCode);
        const objectName = deriveObjectName(file.name);
        return {
          key: `${file.name}-${Date.now()}-${Math.random()}`,
          objectType,
          objectName,
          packageName: "",
          sourceCode,
          filename: file.name,
        };
      }),
    );

    setObjects((prev) => {
      // Deduplicate by objectName
      const existing = new Set(prev.map((o) => o.objectName));
      const fresh = parsed.filter((p) => !existing.has(p.objectName));
      return [...prev, ...fresh];
    });
  }, []);

  // ── Drag-drop handlers ──────────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      parseFiles(e.dataTransfer.files);
    },
    [parseFiles],
  );

  // ── Paste tab ───────────────────────────────────────────────────────────────

  const addPasteObject = () => {
    const name = pasteName.trim().toUpperCase();
    if (!name || !pasteSource.trim()) {
      toast.error("Provide both an object name and source code");
      return;
    }
    const obj: ParsedObject = {
      key: `paste-${Date.now()}`,
      objectType: pasteType,
      objectName: name,
      packageName: "",
      sourceCode: pasteSource,
      filename: `${name}.abap`,
    };
    setObjects((prev) => [...prev, obj]);
    setPasteSource("");
    setPasteName("");
  };

  // ── Editing parsed objects ──────────────────────────────────────────────────

  const updateObject = (key: string, patch: Partial<ParsedObject>) => {
    setObjects((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  };

  const removeObject = (key: string) => {
    setObjects((prev) => prev.filter((o) => o.key !== key));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleUpload = () => {
    if (objects.length === 0) return;
    upload.mutate({
      projectId,
      objects: objects.map((o) => ({
        objectType: o.objectType,
        objectName: o.objectName,
        packageName: o.packageName || undefined,
        sourceCode: o.sourceCode,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload ABAP Objects</DialogTitle>
          <DialogDescription>
            Drop .abap files or paste source code. Object type and name are
            auto-detected but can be edited before uploading.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {(["files", "paste"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "files" ? "Upload Files" : "Paste Source"}
            </button>
          ))}
        </div>

        {/* Files tab */}
        {tab === "files" && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drop .abap files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports abapGit file naming (ZCL_FOO.clas.abap, ZPRG.prog.abap…)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".abap,.txt"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && parseFiles(e.target.files)}
            />
          </div>
        )}

        {/* Paste tab */}
        {tab === "paste" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Object name (e.g. Z_MY_FUNCTION)"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value.toUpperCase())}
                className="flex-1 font-mono text-sm"
              />
              <Select
                value={pasteType}
                onValueChange={(v) => setPasteType(v as ObjectType)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ObjectType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {OBJECT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <textarea
              placeholder="Paste ABAP source code here..."
              className="w-full h-48 text-xs font-mono bg-muted rounded-md p-3 border border-input resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              value={pasteSource}
              onChange={(e) => setPasteSource(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addPasteObject}
              disabled={!pasteName.trim() || !pasteSource.trim()}
            >
              <Plus className="h-4 w-4" />
              Add to queue
            </Button>
          </div>
        )}

        {/* Parsed objects list */}
        {objects.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ready to upload ({objects.length})
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {objects.map((obj) => (
                <div
                  key={obj.key}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                >
                  <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <Input
                      value={obj.objectName}
                      onChange={(e) =>
                        updateObject(obj.key, {
                          objectName: e.target.value.toUpperCase(),
                        })
                      }
                      className="h-7 text-xs font-mono w-52 min-w-0"
                    />
                    <Select
                      value={obj.objectType}
                      onValueChange={(v) =>
                        updateObject(obj.key, { objectType: v as ObjectType })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ObjectType).map((t) => (
                          <SelectItem key={t} value={t} className="text-xs">
                            {OBJECT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Package (optional)"
                      value={obj.packageName}
                      onChange={(e) =>
                        updateObject(obj.key, {
                          packageName: e.target.value.toUpperCase(),
                        })
                      }
                      className="h-7 text-xs font-mono w-36"
                    />
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {(obj.sourceCode.split("\n").length).toLocaleString()} lines
                    </Badge>
                  </div>
                  <button
                    onClick={() => removeObject(obj.key)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={objects.length === 0 || upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {upload.isPending
              ? "Uploading…"
              : `Upload ${objects.length} object${objects.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
