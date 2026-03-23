/**
 * SAP RFC Connector
 *
 * Requires:
 *   npm install node-rfc
 *   SAP NW RFC SDK installed on the system (download from SAP Support Portal)
 */

import { ObjectType } from "@prisma/client";

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

// ─── Internal RFC Types (node-rfc ships loose types in some versions) ─────────

type RfcScalar = string | number | Buffer;
type RfcTable = Record<string, RfcScalar>[];
type RfcStructure = Record<string, RfcScalar>;
type RfcResult = Record<string, RfcScalar | RfcTable | RfcStructure>;

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

// ─── SAPConnector ─────────────────────────────────────────────────────────────

type RfcClient = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  call: (fn: string, params: Record<string, unknown>) => Promise<RfcResult>;
};

export class SAPConnector {
  private client: RfcClient | null = null;
  private connected = false;

  constructor(private readonly params: SAPConnectionParams) {}

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeRfc = require("node-rfc") as {
        Client: new (params: Record<string, string>) => RfcClient;
      };

      this.client = new nodeRfc.Client({
        host: this.params.host,
        sysnr: this.params.systemNumber,
        client: this.params.client,
        user: this.params.user,
        passwd: this.params.password,
        lang: this.params.lang ?? "EN",
      });

      await this.client.open();
      this.connected = true;
    } catch (err) {
      if (err instanceof SAPConnectionError) throw err;
      throw new SAPConnectionError(
        `Failed to connect to SAP at ${this.params.host}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.close();
      } finally {
        this.connected = false;
        this.client = null;
      }
    }
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

  // ── RFC Call Wrapper ────────────────────────────────────────────────────────

  private async call(
    funcName: string,
    params: Record<string, unknown> = {},
  ): Promise<RfcResult> {
    if (!this.connected || !this.client) {
      throw new SAPConnectionError(
        "Not connected to SAP. Call connect() first.",
      );
    }
    try {
      return await this.client.call(funcName, params);
    } catch (err) {
      throw new SAPConnectionError(
        `RFC ${funcName} failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Health Check ────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      await this.call("RFC_PING");
      return true;
    } catch {
      return false;
    }
  }

  // ── System Info ─────────────────────────────────────────────────────────────

  async getSystemInfo(): Promise<SAPSystemInfo> {
    const result = await this.call("RFC_SYSTEM_INFO");
    const info = result.RFCSI_EXPORT as RfcStructure;

    return {
      systemId: String(info.RFCSYSID ?? ""),
      hostname: String(info.RFCHOST ?? ""),
      sapRelease: String(info.RFCRELEASE ?? ""),
      kernelRelease: String(info.RFCKERNRL ?? ""),
      databaseType: String(info.RFCDBSYS ?? ""),
    };
  }

  // ── Object Listing ──────────────────────────────────────────────────────────

  /**
   * Lists all custom ABAP objects (Z* and Y* namespaces) across all supported
   * types.  Uses REPOSITORY_OBJECT_GET for individual metadata and RFC_READ_TABLE
   * on TADIR for bulk listing.
   */
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

          for (const row of result.DATA as RfcTable) {
            const parts = String(row.WA ?? "")
              .split("|")
              .map((s) => s.trim());
            // parts[0] = OBJECT, parts[1] = OBJ_NAME, parts[2] = DEVCLASS
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

  // ── Source Code Fetching ────────────────────────────────────────────────────

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

  // ── Program / Report ───────────────────────────────────────────────────────

  private async fetchProgramSource(programName: string): Promise<string> {
    const result = await this.call("READ_REPORT", {
      PROGRAM: programName,
      WITH_INCLUDES: "X",
    });
    const lines = result.SOURCE_EXTENDED as RfcTable;
    if (!lines?.length) {
      throw new SAPExtractionError(
        `No source returned for program ${programName}`,
        programName,
      );
    }
    return lines.map((row) => String(row.LINE ?? "")).join("\n");
  }

  // ── Function Group ─────────────────────────────────────────────────────────

  private async fetchFunctionGroupSource(
    functionGroupName: string,
  ): Promise<string> {
    // List all function modules in this group via TFDIR
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

    for (const row of tfdir.DATA as RfcTable) {
      const funcName = String(row.WA ?? "").trim();
      if (!funcName) continue;
      try {
        const result = await this.call("RPY_FUNCTIONMODULE_READ", {
          FUNCTIONNAME: funcName,
        });
        const srcLines = result.SOURCE_LINES as RfcTable;
        const source = srcLines?.map((l) => String(l.LINE ?? "")).join("\n");
        parts.push(
          `\n* Function Module: ${funcName}\n${source ?? "* (no source)"}`,
        );
      } catch {
        parts.push(`\n* Function Module: ${funcName}\n* (source unavailable)`);
      }
    }

    return parts.join("\n");
  }

  // ── ABAP Class ─────────────────────────────────────────────────────────────

  private async fetchClassSource(className: string): Promise<string> {
    try {
      const result = await this.call("RPY_CLASS_READ", {
        CLSNAME: className,
        STATE: "A",
      });

      const parts: string[] = [`* ABAP Class: ${className}`];
      const methods = result.METHODS as RfcTable;

      if (methods?.length) {
        for (const method of methods) {
          const methodName = String(method.CPDNAME ?? method.CMPNAME ?? "");
          if (!methodName) continue;
          try {
            const mResult = await this.call("RPY_CLASSMETHOD_SOURCE_GET", {
              CLSNAME: className,
              CPDNAME: methodName,
            });
            const srcLines = mResult.RESULT_SOURCE as RfcTable;
            const source = srcLines?.map((l) => String(l.LINE ?? "")).join("\n");
            parts.push(`\n* Method: ${methodName}\n${source ?? ""}`);
          } catch {
            parts.push(`\n* Method: ${methodName}\n* (source unavailable)`);
          }
        }
      }

      return parts.join("\n") || `* Class ${className} (no methods found)`;
    } catch {
      // Fallback: the class pool program is named like CL_<CLASS>=========CP
      const poolName = `CL_${className}`.padEnd(30, "=").substring(0, 30) + "CP";
      return this.fetchProgramSource(poolName).catch(
        () => `* Class ${className} source unavailable`,
      );
    }
  }

  // ── ABAP Interface ─────────────────────────────────────────────────────────

  private async fetchInterfaceSource(interfaceName: string): Promise<string> {
    try {
      const result = await this.call("RPY_INTERFACE_READ", {
        INTFNAME: interfaceName,
        STATE: "A",
      });

      const lines: string[] = [`INTERFACE ${interfaceName} PUBLIC.`];

      const attributes = result.ATTRIBUTES as RfcTable;
      if (attributes?.length) {
        for (const attr of attributes) {
          lines.push(
            `  DATA ${String(attr.CMPNAME ?? "").padEnd(30)} TYPE ${String(attr.TYPTYPE ?? "")} ${String(attr.TYPE ?? "")}.`,
          );
        }
      }

      const methods = result.METHODS as RfcTable;
      if (methods?.length) {
        for (const method of methods) {
          lines.push(`  METHODS ${String(method.CMPNAME ?? "")}.`);
        }
      }

      lines.push("ENDINTERFACE.");
      return lines.join("\n");
    } catch {
      return `* Interface ${interfaceName} source unavailable`;
    }
  }

  // ── DDIC: Table ────────────────────────────────────────────────────────────

  private async fetchTableDefinition(tableName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_TABL_GET", {
        NAME: tableName,
        STATE: "A",
        LANGU: "E",
      });

      const header = result.DD02V as RfcStructure;
      const fields = result.DFIES_TAB as RfcTable;

      const lines: string[] = [
        `* SAP Transparent Table: ${tableName}`,
        `* Description : ${header?.DDTEXT ?? ""}`,
        `* Table Class : ${header?.TABCLASS ?? ""}`,
        `* Delivery Cat: ${header?.CONTFLAG ?? ""}`,
        `*`,
        `* Fields:`,
        `* ${"FIELDNAME".padEnd(30)} ${"DATATYPE".padEnd(10)} ${"LENGTH".padEnd(8)} DESCRIPTION`,
      ];

      for (const field of fields ?? []) {
        lines.push(
          `*   ${String(field.FIELDNAME ?? "").padEnd(30)} ${String(field.DATATYPE ?? "").padEnd(10)} ${String(field.LENG ?? "").padEnd(8)} ${field.FIELDTEXT ?? ""}`,
        );
      }

      return lines.join("\n");
    } catch {
      return `* Table ${tableName} definition unavailable`;
    }
  }

  // ── DDIC: View ─────────────────────────────────────────────────────────────

  private async fetchViewDefinition(viewName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_VIEW_GET", {
        NAME: viewName,
        STATE: "A",
        LANGU: "E",
      });

      const header = result.DD25V as RfcStructure;
      const fields = result.DFIES_TAB as RfcTable;

      const lines: string[] = [
        `* SAP View: ${viewName}`,
        `* Description : ${header?.DDTEXT ?? ""}`,
        `* View Type   : ${header?.VIEWCLASS ?? ""}`,
        `*`,
        `* Fields:`,
      ];

      for (const field of fields ?? []) {
        lines.push(
          `*   ${String(field.FIELDNAME ?? "").padEnd(30)} ${String(field.DATATYPE ?? "").padEnd(10)} ${field.LENG ?? ""}`,
        );
      }

      return lines.join("\n");
    } catch {
      return `* View ${viewName} definition unavailable`;
    }
  }

  // ── DDIC: Data Element ─────────────────────────────────────────────────────

  private async fetchDataElementDefinition(dtelName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_DTEL_GET", {
        NAME: dtelName,
        STATE: "A",
        LANGU: "E",
      });

      const header = result.DD04V as RfcStructure;
      return [
        `* SAP Data Element: ${dtelName}`,
        `* Description: ${header?.DDTEXT ?? ""}`,
        `* Domain     : ${header?.DOMNAME ?? ""}`,
        `* Data Type  : ${header?.DATATYPE ?? ""}`,
        `* Length     : ${header?.LENG ?? ""}`,
        `* Decimals   : ${header?.DECIMALS ?? ""}`,
        `* Search Help: ${header?.SHLPNAME ?? ""}`,
      ].join("\n");
    } catch {
      return `* Data Element ${dtelName} definition unavailable`;
    }
  }

  // ── DDIC: Domain ───────────────────────────────────────────────────────────

  private async fetchDomainDefinition(domainName: string): Promise<string> {
    try {
      const result = await this.call("DDIF_DOMA_GET", {
        NAME: domainName,
        STATE: "A",
        LANGU: "E",
      });

      const header = result.DD01V as RfcStructure;
      const fixedValues = result.DD07V_TAB as RfcTable;

      const lines: string[] = [
        `* SAP Domain: ${domainName}`,
        `* Description: ${header?.DDTEXT ?? ""}`,
        `* Data Type  : ${header?.DATATYPE ?? ""}`,
        `* Length     : ${header?.LENG ?? ""}`,
        `* Decimals   : ${header?.DECIMALS ?? ""}`,
        `* Conv. Routine: ${header?.CONVEXIT ?? ""}`,
      ];

      if (fixedValues?.length) {
        lines.push(`*`, `* Fixed Values:`);
        for (const val of fixedValues) {
          lines.push(
            `*   ${String(val.DOMVALUE_L ?? "").padEnd(20)} ${val.DDTEXT ?? ""}`,
          );
        }
      }

      return lines.join("\n");
    } catch {
      return `* Domain ${domainName} definition unavailable`;
    }
  }

  // ── Full Object Extraction ──────────────────────────────────────────────────

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
