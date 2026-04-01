"use client";

import { useRef, useState, useCallback } from "react";
import { Copy, Check, Maximize2, Minimize2, WrapText, AlignLeft } from "lucide-react";

// ── HTML escape ───────────────────────────────────────────────────────────────
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── ABAP token types ──────────────────────────────────────────────────────────
const ABAP_KW = new Set([
  "SELECT","FROM","WHERE","INTO","TABLE","LOOP","AT","ENDLOOP","IF","ELSE",
  "ELSEIF","ENDIF","CASE","WHEN","OTHERS","ENDCASE","DO","ENDDO","WHILE",
  "ENDWHILE","METHOD","ENDMETHOD","CLASS","ENDCLASS","FORM","ENDFORM",
  "FUNCTION","ENDFUNCTION","DATA","TYPES","CONSTANTS","TABLES","MOVE",
  "ASSIGN","CLEAR","REFRESH","FREE","APPEND","READ","WRITE","PERFORM",
  "CALL","RAISE","CATCH","CLEANUP","ENDTRY","TRY","CREATE","OBJECT",
  "CONCATENATE","SPLIT","CONDENSE","TRANSLATE","CHECK","EXIT","CONTINUE",
  "RETURN","LIKE","TYPE","VALUE","INITIAL","STRUCTURE","IMPORTING",
  "EXPORTING","CHANGING","USING","RAISING","EXCEPTIONS","SINGLE","INNER",
  "LEFT","OUTER","JOIN","ORDER","BY","GROUP","HAVING","ENDSELECT","INSERT",
  "UPDATE","DELETE","MODIFY","COMMIT","ROLLBACK","WORK","MESSAGE","REPORT",
  "PROGRAM","INCLUDE","INTERFACE","ENDINTERFACE","MODULE","ENDMODULE","AS",
  "ON","NEW","LET","IN","CONV","COND","SWITCH","FILTER","REDUCE","FOR",
  "EACH","FIELDS","COMPONENTS","REF","CAST","AUTHORITY-CHECK","ID","FIELD",
  "DUMMY","OPEN","CLOSE","CURSOR","FETCH","DESCRIBE","COLLECT","SORT",
  "FIND","REPLACE","SHIFT","OVERLAY","PACK","UNPACK","WRITE","SKIP",
  "ULINE","AT","END","OF","LINE","TOP","PAGE","FIRST","LAST","ENDAT",
  "FIELD-SYMBOLS","ASSIGNING","UNASSIGN","IS","ASSIGNED","NOT","AND","OR",
  "EQ","NE","LT","GT","LE","GE","BETWEEN","IN","LIKE","RANGE","CP","NP",
  "CO","CN","CA","NA","CS","NS","MOVE-CORRESPONDING","COMPUTE","ADD","SUB",
  "MULTIPLY","DIVIDE","SUBTRACT","DEFINED","ABSTRACT","ALIASES","ALL",
  "ASSERT","ASSOCIATED","BREAK-POINT","CLASS-DATA","CLASS-EVENTS",
  "CLASS-METHODS","CLASS-POOL","COLUMN","DEFINITION","DEFERRED",
  "DETAIL","DISPLAY-MODE","DIVISION","EVENTS","FINAL","FRIENDS",
  "GENERATE","GLOBAL","HEADER","IMPLEMENTATION","INHERITING","INSTANCE",
  "LOCAL","METHODS","OPTIONAL","PREFERRED","PRIVATE","PROTECTED","PUBLIC",
  "RECEIVING","REDEFINITION","SECTION","STATIC","SUPPLY",
]);

function highlightABAP(code: string): string {
  return code.split("\n").map(rawLine => {
    const trimmed = rawLine.trimStart();

    // Full-line comment (* at start)
    if (trimmed.startsWith("*")) {
      return `<span class="abap-cmt">${escapeHtml(rawLine)}</span>`;
    }

    // Tokenize: strings ('...') and inline comments (")
    const tokens: { type: "code" | "str" | "cmt"; content: string }[] = [];
    let i = 0;
    let buf = "";
    let inStr = false;

    while (i < rawLine.length) {
      const ch = rawLine[i];
      if (!inStr && ch === "'") {
        if (buf) tokens.push({ type: "code", content: buf });
        buf = ch;
        inStr = true;
        i++;
      } else if (inStr && ch === "'") {
        if (rawLine[i + 1] === "'") { buf += "''"; i += 2; }
        else { buf += ch; tokens.push({ type: "str", content: buf }); buf = ""; inStr = false; i++; }
      } else if (!inStr && ch === '"') {
        if (buf) tokens.push({ type: "code", content: buf });
        tokens.push({ type: "cmt", content: rawLine.slice(i) });
        buf = "";
        break;
      } else {
        buf += ch; i++;
      }
    }
    if (buf) tokens.push({ type: inStr ? "str" : "code", content: buf });

    return tokens.map(t => {
      const esc = escapeHtml(t.content);
      if (t.type === "cmt") return `<span class="abap-cmt">${esc}</span>`;
      if (t.type === "str") return `<span class="abap-str">${esc}</span>`;

      // Highlight keywords, numbers, type-prefixed variables, operators
      return esc
        // numbers
        .replace(/\b(\d+)\b/g, '<span class="abap-num">$1</span>')
        // keywords (case-insensitive)
        .replace(/\b([A-Z][A-Z0-9_-]*)\b/gi, (m) =>
          ABAP_KW.has(m.toUpperCase())
            ? `<span class="abap-kw">${m}</span>`
            : m
        )
        // system vars sy-*
        .replace(/\b(sy-\w+)\b/gi, '<span class="abap-sys">$1</span>')
        // common var prefixes lv_ lt_ ls_ lo_ gv_ gt_ gs_ go_
        .replace(/\b([lLgG][tovsTOVS]_\w+)\b/g, '<span class="abap-var">$1</span>')
        // method call arrows
        .replace(/-&gt;/g, '<span class="abap-op">-&gt;</span>')
        .replace(/=&gt;/g, '<span class="abap-op">=&gt;</span>')
        // operators = + - * /
        .replace(/(?<![<>!])=(?!=)/g, '<span class="abap-op">=</span>');
    }).join("");
  }).join("\n");
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  language?: string;
  minHeight?: string;
  maxHeight?: string;
  label?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  language = "abap",
  minHeight = "320px",
  maxHeight = "520px",
  label,
}: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const lines = value.split("\n");
  const lineCount = lines.length;

  // Keep gutter, mirror, textarea scrolled in sync
  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    const gutter = gutterRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
    if (gutter) gutter.scrollTop = ta.scrollTop;
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = taRef.current!;
      const s = ta.selectionStart, end = ta.selectionEnd;
      const next = value.slice(0, s) + "  " + value.slice(end);
      onChange?.(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
  }, [value, onChange]);

  const updateCursor = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const pos = (e.currentTarget as HTMLTextAreaElement).selectionStart;
    const before = value.slice(0, pos).split("\n");
    setCursor({ line: before.length, col: before[before.length - 1].length + 1 });
  }, [value]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = language === "abap" ? highlightABAP(value) : escapeHtml(value);
  const computedHeight = expanded ? "calc(100vh - 220px)" : undefined;

  return (
    <div
      className="ced-root"
      style={computedHeight ? { height: computedHeight } : { minHeight, maxHeight }}
    >
      {/* ── Title bar ─────────────────────────────────────────────── */}
      <div className="ced-bar">
        <div className="ced-dots">
          <span /><span /><span />
        </div>
        {label && <span className="ced-label">{label}</span>}
        <span className="ced-lang">{language.toUpperCase()}</span>
        <div className="ced-bar-actions">
          <button
            className="ced-action"
            onClick={() => setWrap(w => !w)}
            title={wrap ? "Disable wrap" : "Enable wrap"}
          >
            {wrap ? <AlignLeft size={12} /> : <WrapText size={12} />}
          </button>
          <button className="ced-action" onClick={handleCopy} title="Copy">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            className="ced-action"
            onClick={() => setExpanded(x => !x)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* ── Editor body ───────────────────────────────────────────── */}
      <div className="ced-body">
        {/* Line numbers */}
        <div className="ced-gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className={`ced-ln${cursor.line === i + 1 ? " ced-ln-active" : ""}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code layer */}
        <div className="ced-code-wrap">
          {/* Syntax-highlighted mirror (display only) */}
          <div
            ref={mirrorRef}
            className="ced-mirror"
            style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
            dangerouslySetInnerHTML={{ __html: highlighted + "\n\u200b" }}
            aria-hidden="true"
          />
          {/* Textarea — transparent, captures all input */}
          <textarea
            ref={taRef}
            className="ced-textarea"
            style={{ whiteSpace: wrap ? "pre-wrap" : "pre", overflowWrap: wrap ? "break-word" : "normal" }}
            value={value}
            onChange={handleChange}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            onClick={updateCursor}
            onKeyUp={updateCursor}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {/* ── Status bar ────────────────────────────────────────────── */}
      <div className="ced-status">
        <span className={`ced-mode ${readOnly ? "ced-mode-ro" : "ced-mode-edit"}`}>
          {readOnly ? "● READ ONLY" : "● EDITING"}
        </span>
        <div className="ced-status-right">
          <span>Ln {cursor.line}</span>
          <span className="ced-sep">·</span>
          <span>Col {cursor.col}</span>
          <span className="ced-sep">·</span>
          <span>{lineCount} lines</span>
          <span className="ced-sep">·</span>
          <span>{value.length.toLocaleString()} chars</span>
        </div>
      </div>
    </div>
  );
}
