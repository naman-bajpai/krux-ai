/**
 * SAP RFC Connector — SOAP HTTP Transport
 *
 * Uses SAP's built-in SOAP RFC adapter (available since BASIS 6.40).
 * No native addon or SAP NW RFC SDK required.
 *
 * SAP must have the SOAP RFC service active:
 *   Transaction SICF → /sap/bc/soap/rfc → Activate
 */

import { ObjectType } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class SAPConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SAPConnectionError";
  }
}

export class SAPExtractionError extends Error {
  constructor(
    message: string,
    public readonly objectName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SAPExtractionError";
  }
}

// ─── SAP Connection & Object Types ───────────────────────────────────────────

export interface SAPConnectionParams {
  host: string;
  systemNumber: string; // e.g. "00"
  client: string; // e.g. "800"
  user: string;
  password: string;
  lang?: string; // default "EN"
  port?: number; // explicit port; defaults to 8000 + parseInt(systemNumber)
  useSSL?: boolean; // default false
}

/** SAP ABAP object type codes */
export type SAPObjectTypeCode =
  | "PROG" // Programs / Reports
  | "FUGR" // Function Groups
  | "CLAS" // ABAP Classes
  | "INTF" // ABAP Interfaces
  | "TABL" // Transparent Tables
  | "VIEW" // Views
  | "DTEL" // Data Elements
  | "DOMA"; // Domains

/** A single repository object fetched from SAP */
export interface SAPRepositoryObject {
  objectType: SAPObjectTypeCode;
  objectName: string;
  packageName: string;
  sourceCode: string;
  prismaObjectType: ObjectType;
}

/** Info returned from RFC_SYSTEM_INFO */
export interface SAPSystemInfo {
  systemId: string;
  hostname: string;
  sapRelease: string;
  kernelRelease: string;
  databaseType: string;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type RfcScalar = string | number;
type RfcTable = Record<string, RfcScalar>[];
type RfcStructure = Record<string, RfcScalar>;
/** Parsed RFC response — field values may be scalars, structs, or tables */
type RfcResult = Record<string, RfcScalar | RfcTable | RfcStructure | unknown>;

// ─── Type-code ↔ Prisma Enum Mapping ─────────────────────────────────────────

export const SAP_TYPE_TO_PRISMA_MAP: Record<SAPObjectTypeCode, ObjectType> = {
  PROG: ObjectType.PROGRAM,
  FUGR: ObjectType.FUNCTION_MODULE,
  CLAS: ObjectType.CLASS,
  INTF: ObjectType.INTERFACE,
  TABL: ObjectType.TABLE,
  VIEW: ObjectType.VIEW,
  DTEL: ObjectType.DATA_ELEMENT,
  DOMA: ObjectType.DOMAIN,
};

const SUPPORTED_OBJECT_TYPES: SAPObjectTypeCode[] = [
  "PROG",
  "FUGR",
  "CLAS",
  "INTF",
  "TABL",
  "VIEW",
  "DTEL",
  "DOMA",
];

// ─── XML Parser (shared instance) ────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Strip namespace prefixes so we can access <urn:FOO> as just FOO
  transformTagName: (name: string) => name.replace(/^[^:]+:/, ""),
  // SAP tables come back as <item> elements — always treat as array
  isArray: (name: string) => name === "item",
  parseTagValue: true,
  trimValues: true,
});

// ─── SOAP Helpers ─────────────────────────────────────────────────────────────

/**
 * Serialise an RFC parameter value to an XML fragment.
 * Handles: scalar (string/number), flat object (structure), array of objects (table rows).
 */
function serializeParam(name: string, value: unknown): string {
  if (Array.isArray(value)) {
    // Table parameter — wrap each entry in <item>
    const rows = value
      .map((row: Record<string, unknown>) => {
        const fields = Object.entries(row)
          .map(([k, v]) => `<${k}>${escXml(String(v ?? ""))}</${k}>`)
          .join("");
        return `<item>${fields}</item>`;
      })
      .join("");
    return `<${name}>${rows}</${name}>`;
  }

  if (value !== null && typeof value === "object") {
    // Structure parameter
    const fields = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `<${k}>${escXml(String(v ?? ""))}</${k}>`)
      .join("");
    return `<${name}>${fields}</${name}>`;
  }

  // Scalar
  return `<${name}>${escXml(String(value ?? ""))}</${name}>`;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSoapEnvelope(
  funcName: string,
  params: Record<string, unknown>,
): string {
  const paramXml = Object.entries(params)
    .map(([k, v]) => serializeParam(k, v))
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <SOAP-ENV:Body>
    <urn:${funcName}>
      ${paramXml}
    </urn:${funcName}>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

// ─── SAPConnector ─────────────────────────────────────────────────────────────

export class SAPConnector {
  private baseUrl: string;
  private authHeader: string;
  private connected = false;

  constructor(private readonly params: SAPConnectionParams) {
    const scheme = params.useSSL ? "https" : "http";
    const port =
      params.port ?? (8000 + parseInt(params.systemNumber ?? "00", 10));
    this.baseUrl = `${scheme}://${params.host}:${port}/sap/bc/soap/rfc?sap-client=${params.client}`;
    this.authHeader =
      "Basic " +
      Buffer.from(`${params.user}:${params.password}`).toString("base64");
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  /** Verifies connectivity with a lightweight RFC_PING call. */
  async connect(): Promise<void> {
    try {
      const ok = await this.ping();
      if (!ok) {
        throw new SAPConnectionError(
          `SAP SOAP endpoint did not respond to RFC_PING at ${this.baseUrl}`,
        );
      }
      this.connected = true;
    } catch (err) {
      if (err instanceof SAPConnectionError) throw err;
      throw new SAPConnectionError(
        `Failed to connect to SAP at ${this.params.host}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  /** No-op for SOAP transport — stateless HTTP, nothing to close. */
  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /** Run connect → work → disconnect safely. */
  async withConnection<T>(fn: (connector: this) => Promise<T>): Promise<T> {
    await this.connect();
    try {
      return await fn(this);
    } finally {
      await this.disconnect();
    }
  }

  // ── RFC Call ─────────────────────────────────────────────────────────────────

  private async call(
    funcName: string,
    params: Record<string, unknown> = {},
  ): Promise<RfcResult> {
    const body = buildSoapEnvelope(funcName, params);

    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: funcName,
          Authorization: this.authHeader,
          Accept: "text/xml",
        },
        body,
      });
    } catch (err) {
      throw new SAPConnectionError(
        `HTTP request to SAP failed (${funcName}): ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const text = await res.text();

    if (!res.ok) {
      // Try to extract SOAP fault message for better DX
      const faultMatch = /<faultstring[^>]*>([^<]+)<\/faultstring>/i.exec(text);
      const detail = faultMatch ? faultMatch[1] : `HTTP ${res.status}`;
      throw new SAPConnectionError(`RFC ${funcName} failed: ${detail}`);
    }

    const parsed = xmlParser.parse(text) as Record<string, unknown>;

    // Check for SOAP fault in a 200 OK response (SAP occasionally does this)
    const fault = this.dig(parsed, ["Envelope", "Body", "Fault"]) as
      | Record<string, unknown>
      | undefined;
    if (fault) {
      const msg = String(fault["faultstring"] ?? "Unknown SOAP fault");
      throw new SAPConnectionError(`RFC ${funcName} SOAP fault: ${msg}`);
    }

    // Navigate to <Envelope><Body><FUNCNAME.Response>
    const responseKey = `${funcName}.Response`;
    const responseBody = this.dig(parsed, [
      "Envelope",
      "Body",
      responseKey,
    ]) as RfcResult | undefined;

    if (!responseBody) {
      throw new SAPConnectionError(
        `RFC ${funcName}: unexpected response structure — missing ${responseKey}`,
      );
    }

    return this.normalizeResult(responseBody);
  }

  /** Recursively navigate an object by key path, case-insensitively. */
  private dig(obj: unknown, keys: string[]): unknown {
    let cur = obj;
    for (const key of keys) {
      if (cur == null || typeof cur !== "object") return undefined;
      const map = cur as Record<string, unknown>;
      // Exact match first, then case-insensitive fallback
      if (key in map) {
        cur = map[key];
      } else {
        const lower = key.toLowerCase();
        const found = Object.keys(map).find((k) => k.toLowerCase() === lower);
        cur = found ? map[found] : undefined;
      }
    }
    return cur;
  }

  /**
   * Normalises parsed XML output to resemble node-rfc output:
   * - Objects with a single "item" key → flat array
   * - Scalar item arrays left as-is
   */
  private normalizeResult(result: RfcResult): RfcResult {
    const out: RfcResult = {};
    for (const [key, value] of Object.entries(result)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "item" in (value as Record<string, unknown>)
      ) {
        // SAP table → unwrap to array
        out[key] = (value as Record<string, unknown>)["item"] as RfcTable;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  // ── Health Check ─────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.call("RFC_PING");
      return true;
    } catch {
      return false;
    }
  }

  // ── System Info ──────────────────────────────────────────────────────────────

  async getSystemInfo(): Promise<SAPSystemInfo> {
    const result = await this.call("RFC_SYSTEM_INFO");
    const info = (result["RFCSI_EXPORT"] ?? {}) as RfcStructure;

    return {
      systemId: String(info["RFCSYSID"] ?? ""),
      hostname: String(info["RFCHOST"] ?? ""),
      sapRelease: String(info["RFCRELEASE"] ?? ""),
      kernelRelease: String(info["RFCKERNRL"] ?? ""),
      databaseType: String(info["RFCDBSYS"] ?? ""),
    };
  }

  // ── Object Listing ───────────────────────────────────────────────────────────

  async listCustomObjects(): Promise<
    Array<{
      objectType: SAPObjectTypeCode;
      objectName: string;
      packageName: string;
    }>
  > {
    const objects: Array<{
      objectType: SAPObjectTypeCode;
      objectName: string;
      packageName: string;
    }> = [];

    for (const objectType of SUPPORTED_OBJECT_TYPES) {
      for (const namespace of ["Z%", "Y%"]) {
        try {
          const result = await this.call("RFC_READ_TABLE", {
            QUERY_TABLE: "TADIR",
            DELIMITER: "|",
            OPTIONS: [
              {
                TEXT: `PGMID = 'R3TR' AND OBJECT = '${objectType}' AND OBJ_NAME LIKE '${namespace}'`,
              },
            ],
            FIELDS: [
              { FIELDNAME: "OBJECT" },
              { FIELDNAME: "OBJ_NAME" },
              { FIELDNAME: "DEVCLASS" },
            ],
          });

          for (const row of (result["DATA"] as RfcTable) ?? []) {
            const parts = String(row["WA"] ?? "")
              .split("|")
              .map((s) => s.trim());
            if (parts[1]) {
              objects.push({
                objectType,
                objectName: parts[1],
                packageName: parts[2] ?? "",
              });
            }
          }
        } catch (err) {
          console.warn(
            `[SAPConnector] Could not list ${objectType}/${namespace}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    return objects;
  }

  // ── Source Code Fetching ─────────────────────────────────────────────────────

  async fetchSourceCode(
    objectType: SAPObjectTypeCode,
    objectName: string,
  ): Promise<string> {
    switch (objectType) {
      case "PROG":
        return this.fetchProgramSource(objectName);
      case "FUGR":
        return this.fetchFunctionGroupSource(objectName);
      case "CLAS":
        return this.fetchClassSource(objectName);
      case "INTF":
        return this.fetchInterfaceSource(objectName);
      case "TABL":
        return this.fetchTableDefinition(objectName);
      case "VIEW":
        return this.fetchViewDefinition(objectName);
      case "DTEL":
        return this.fetchDataElementDefinition(objectName);
      case "DOMA":
        return this.fetchDomainDefinition(objectName);
    }
  }

  // ── Program / Report ──────────────────────────────────────────────────────────

  private async fetchProgramSource(programName: string): Promise<string> {
    const result = await this.call("READ_REPORT", {
      PROGRAM: programName,
      WITH_INCLUDES: "X",
    });
    const lines = (result["SOURCE_EXTENDED"] as RfcTable) ?? [];
    if (!lines.length) {
      throw new SAPExtractionError(
        `No source returned for program ${programName}`,
        programName,
      );
    }
    return lines.map((row) => String(row["LINE"] ?? "")).join("\n");
  }

  // ── Function Group ────────────────────────────────────────────────────────────

  private async fetchFunctionGroupSource(
    functionGroupName: string,
  ): Promise<string> {
    const tfdir = await this.call("RFC_READ_TABLE", {
      QUERY_TABLE: "TFDIR",
      DELIMITER: "|",
      OPTIONS: [{ TEXT: `PNAME = 'SAPL${functionGroupName}'` }],
      FIELDS: [{ FIELDNAME: "FUNCNAME" }],
    });

    const parts: string[] = [
      `* Function Group: ${functionGroupName}`,
      `* ` + "─".repeat(60),
    ];

    for (const row of (tfdir["DATA"] as RfcTable) ?? []) {
      const funcName = String(row["WA"] ?? "").trim();
      if (!funcName) continue;
      try {
        const result = await this.call("RPY_FUNCTIONMODULE_READ", {
          FUNCTIONNAME: funcName,
        });
        const srcLines = (result["SOURCE_LINES"] as RfcTable) ?? [];
        const source = srcLines.map((l) => String(l["LINE"] ?? "")).join("\n");
        parts.push(`\n* Function Module: ${funcName}\n${source || "* (no source)"}`);
      } catch {
        parts.push(`\n* Function Module: ${funcName}\n* (source unavailable)`);
      }
    }

    return parts.join("\n");
  }

  // ── ABAP Class ────────────────────────────────────────────────────────────────

  private async fetchClassSource(className: string): Promise<string> {
    try {
      const result = await this.call("RPY_CLASS_READ", {
        CLSNAME: className,
        STATE: "A",
      });

      const parts: string[] = [`* ABAP Class: ${className}`];
      const methods = (result["METHODS"] as RfcTable) ?? [];

      for (const method of methods) {
        const methodName = String(method["CPDNAME"] ?? method["CMPNAME"] ?? "");
        if (!methodName) continue;
        try {
          const mResult = await this.call("RPY_CLASSMETHOD_SOURCE_GET", {
            CLSNAME: className,
            CPDNAME: methodName,
          });
          const srcLines = (mResult["RESULT_SOURCE"] as RfcTable) ?? [];
          const source = srcLines.map((l) => String(l["LINE"] ?? "")).join("\n");
          parts.push(`\n* Method: ${methodName}\n${source}`);
        } catch {
          parts.push(`\n* Method: ${methodName}\n* (source unavailable)`);
        }
      }

      return parts.join("\n") || `* Class ${className} (no methods found)`;
    } catch {
      // Fallback: the class pool program is named CL_<CLASS>=========CP
      const poolName =
        `CL_${className}`.padEnd(30, "=").substring(0, 30) + "CP";
      return this.fetchProgramSource(poolName).catch(
        () => `* Class ${className} source unavailable`,
      );
    }
  }

  // ── ABAP Interface ────────────────────────────────────────────────────────────

  private async fetchInterfaceSource(interfaceName: string): Promise<string> {
    try {
      const result = await this.call("RPY_INTERFACE_READ", {
        INTFNAME: interfaceName,
        STATE: "A",
      });

      const lines: string[] = [`INTERFACE ${interfaceName} PUBLIC.`];

      for (const attr of (result["ATTRIBUTES"] as RfcTable) ?? []) {
        lines.push(
          `  DATA ${String(attr["CMPNAME"] ?? "").padEnd(30)} TYPE ${String(attr["TYPTYPE"] ?? "")} ${String(attr["TYPE"] ?? "")}.`,
        );
      }

      for (const method of (result["METHODS"] as RfcTable) ?? []) {
        lines.push(`  METHODS ${String(method["CMPNAME"] ?? "")}.`);
      }

      lines.push("ENDINTERFACE.");
      return lines.join("\n");
    } catch {
      return `* Interface ${interfaceName} source unavailable`;
    }
  }

  // ── DDIC: Table ───────────────────────────────────────────────────────────────

  private async fetchTableDefinition(tableName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_TABL_GET", {
        NAME: tableName,
        STATE: "A",
        LANGU: "E",
      });

      const header = (result["DD02V"] ?? {}) as RfcStructure;
      const fields = (result["DFIES_TAB"] as RfcTable) ?? [];

      const lines: string[] = [
        `* SAP Transparent Table: ${tableName}`,
        `* Description : ${header["DDTEXT"] ?? ""}`,
        `* Table Class : ${header["TABCLASS"] ?? ""}`,
        `* Delivery Cat: ${header["CONTFLAG"] ?? ""}`,
        `*`,
        `* Fields:`,
        `* ${"FIELDNAME".padEnd(30)} ${"DATATYPE".padEnd(10)} ${"LENGTH".padEnd(8)} DESCRIPTION`,
      ];

      for (const field of fields) {
        lines.push(
          `*   ${String(field["FIELDNAME"] ?? "").padEnd(30)} ${String(field["DATATYPE"] ?? "").padEnd(10)} ${String(field["LENG"] ?? "").padEnd(8)} ${field["FIELDTEXT"] ?? ""}`,
        );
      }

      return lines.join("\n");
    } catch {
      return `* Table ${tableName} definition unavailable`;
    }
  }

  // ── DDIC: View ────────────────────────────────────────────────────────────────

  private async fetchViewDefinition(viewName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_VIEW_GET", {
        NAME: viewName,
        STATE: "A",
        LANGU: "E",
      });

      const header = (result["DD25V"] ?? {}) as RfcStructure;
      const fields = (result["DFIES_TAB"] as RfcTable) ?? [];

      const lines: string[] = [
        `* SAP View: ${viewName}`,
        `* Description : ${header["DDTEXT"] ?? ""}`,
        `* View Type   : ${header["VIEWCLASS"] ?? ""}`,
        `*`,
        `* Fields:`,
      ];

      for (const field of fields) {
        lines.push(
          `*   ${String(field["FIELDNAME"] ?? "").padEnd(30)} ${String(field["DATATYPE"] ?? "").padEnd(10)} ${field["LENG"] ?? ""}`,
        );
      }

      return lines.join("\n");
    } catch {
      return `* View ${viewName} definition unavailable`;
    }
  }

  // ── DDIC: Data Element ────────────────────────────────────────────────────────

  private async fetchDataElementDefinition(dtelName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_DTEL_GET", {
        NAME: dtelName,
        STATE: "A",
        LANGU: "E",
      });

      const header = (result["DD04V"] ?? {}) as RfcStructure;
      return [
        `* SAP Data Element: ${dtelName}`,
        `* Description: ${header["DDTEXT"] ?? ""}`,
        `* Domain     : ${header["DOMNAME"] ?? ""}`,
        `* Data Type  : ${header["DATATYPE"] ?? ""}`,
        `* Length     : ${header["LENG"] ?? ""}`,
        `* Decimals   : ${header["DECIMALS"] ?? ""}`,
        `* Search Help: ${header["SHLPNAME"] ?? ""}`,
      ].join("\n");
    } catch {
      return `* Data Element ${dtelName} definition unavailable`;
    }
  }

  // ── DDIC: Domain ──────────────────────────────────────────────────────────────

  private async fetchDomainDefinition(domainName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_DOMA_GET", {
        NAME: domainName,
        STATE: "A",
        LANGU: "E",
      });

      const header = (result["DD01V"] ?? {}) as RfcStructure;
      const fixedValues = (result["DD07V_TAB"] as RfcTable) ?? [];

      const lines: string[] = [
        `* SAP Domain: ${domainName}`,
        `* Description  : ${header["DDTEXT"] ?? ""}`,
        `* Data Type    : ${header["DATATYPE"] ?? ""}`,
        `* Length       : ${header["LENG"] ?? ""}`,
        `* Decimals     : ${header["DECIMALS"] ?? ""}`,
        `* Conv. Routine: ${header["CONVEXIT"] ?? ""}`,
      ];

      if (fixedValues.length) {
        lines.push(`*`, `* Fixed Values:`);
        for (const val of fixedValues) {
          lines.push(
            `*   ${String(val["DOMVALUE_L"] ?? "").padEnd(20)} ${val["DDTEXT"] ?? ""}`,
          );
        }
      }

      return lines.join("\n");
    } catch {
      return `* Domain ${domainName} definition unavailable`;
    }
  }

  // ── Full Object Extraction ────────────────────────────────────────────────────

  async extractObject(
    objectType: SAPObjectTypeCode,
    objectName: string,
    packageName: string,
  ): Promise<SAPRepositoryObject> {
    const sourceCode = await this.fetchSourceCode(objectType, objectName);

    return {
      objectType,
      objectName,
      packageName,
      sourceCode,
      prismaObjectType: SAP_TYPE_TO_PRISMA_MAP[objectType],
    };
  }
}
