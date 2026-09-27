// src/components/agents/MarkdownRenderer.tsx
// Markdown renderer component supporting headings, bold/italic/code, lists, tables, and preformatted blocks.

import { component$ } from "@builder.io/qwik";

export interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = component$<MarkdownRendererProps>(({ content }) => {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: any[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push({
          type: "code",
          lang: codeBlockLang,
          content: codeBlockContent.join("\n"),
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockContent = [];
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Check for Markdown Table (header row with | followed by delimiter row with | --- |)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(lines[i + 1])) {
      const parseCells = (r: string) => {
        const trimmed = r.trim().replace(/^\|/, "").replace(/\|$/, "");
        return trimmed.split("|").map((c) => c.trim());
      };

      const headers = parseCells(line);
      const alignLine = parseCells(lines[i + 1]);
      const alignments = alignLine.map((a) => {
        const trimmed = a.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
        if (trimmed.endsWith(":")) return "right";
        return "left";
      });

      i += 2; // Advance past header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(parseCells(lines[i]));
        i++;
      }
      i--; // Compensate for loop increment

      elements.push({
        type: "table",
        headers,
        alignments,
        rows,
      });
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push({ type: "h3", content: line.slice(4) });
    } else if (line.startsWith("## ")) {
      elements.push({ type: "h2", content: line.slice(3) });
    } else if (line.startsWith("# ")) {
      elements.push({ type: "h1", content: line.slice(2) });
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      elements.push({ type: "li", content: line.replace(/^[-*•]\s+/, "") });
    } else if (/^\d+\.\s/.test(line)) {
      elements.push({ type: "oli", content: line.replace(/^\d+\.\s/, "") });
    } else if (line.trim() === "") {
      elements.push({ type: "spacer" });
    } else {
      elements.push({ type: "p", content: line });
    }
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push({
      type: "code",
      lang: codeBlockLang,
      content: codeBlockContent.join("\n"),
    });
  }

  const formatInline = (text: string) => {
    const tokens = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return tokens.map((token, pIdx) => {
      if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
        return (
          <strong key={pIdx} style="font-weight:600;color:var(--text-primary);user-select:text;-webkit-user-select:text;">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
        return (
          <em key={pIdx} style="font-style:italic;color:var(--text-primary);user-select:text;-webkit-user-select:text;">
            {token.slice(1, -1)}
          </em>
        );
      }
      if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
        return (
          <code
            key={pIdx}
            style="padding:1px 4px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);font-family:monospace;font-size:0.75rem;user-select:text;-webkit-user-select:text;"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      return token;
    });
  };

  const renderContentWithBreaks = (text: string) => {
    const segments = text.split(/<br\s*\/?>/gi);
    return segments.map((seg, sIdx) => (
      <span key={sIdx} style="display:inline;">
        {sIdx > 0 && <br />}
        {formatInline(seg)}
      </span>
    ));
  };

  return (
    <div style="display:flex;flex-direction:column;gap:0.375rem;user-select:text;-webkit-user-select:text;">
      {elements.map((el, idx) => {
        if (el.type === "h1") {
          return <h1 key={idx} style="font-size:0.9375rem;font-weight:600;margin:0.375rem 0 0.125rem;color:var(--text-primary);user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</h1>;
        }
        if (el.type === "h2") {
          return <h2 key={idx} style="font-size:0.875rem;font-weight:600;margin:0.25rem 0 0.125rem;color:var(--text-primary);user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</h2>;
        }
        if (el.type === "h3") {
          return <h3 key={idx} style="font-size:0.8125rem;font-weight:600;margin:0.25rem 0 0.125rem;color:var(--text-primary);user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</h3>;
        }
        if (el.type === "li") {
          return (
            <div key={idx} style="display:flex;align-items:flex-start;gap:0.375rem;padding-left:0.25rem;user-select:text;-webkit-user-select:text;">
              <span style="color:var(--text-secondary);line-height:1.6;">•</span>
              <span style="flex:1;user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</span>
            </div>
          );
        }
        if (el.type === "oli") {
          return (
            <div key={idx} style="display:flex;align-items:flex-start;gap:0.375rem;padding-left:0.25rem;user-select:text;-webkit-user-select:text;">
              <span style="font-size:0.75rem;color:var(--text-secondary);font-family:monospace;line-height:1.6;">{idx + 1}.</span>
              <span style="flex:1;user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</span>
            </div>
          );
        }
        if (el.type === "code") {
          return (
            <div key={idx} style="margin:0.375rem 0;border-radius:0.375rem;background:var(--surface-1);border:1px solid var(--border);overflow:hidden;user-select:text;-webkit-user-select:text;">
              {el.lang && (
                <div style="padding:0.25rem 0.5rem;background:var(--surface-3);font-size:0.6875rem;font-family:monospace;color:var(--text-secondary);border-bottom:1px solid var(--border);user-select:none;">
                  {el.lang}
                </div>
              )}
              <pre style="margin:0;padding:0.5rem 0.75rem;font-size:0.75rem;font-family:monospace;overflow-x:auto;color:var(--text-primary);line-height:1.5;user-select:text;-webkit-user-select:text;">
                <code style="user-select:text;-webkit-user-select:text;">{el.content}</code>
              </pre>
            </div>
          );
        }
        if (el.type === "table") {
          return (
            <div
              key={idx}
              style="margin:0.5rem 0;border-radius:0.375rem;border:1px solid var(--border);overflow-x:auto;background:var(--surface-1);max-width:100%;user-select:text;-webkit-user-select:text;"
            >
              <table style="width:100%;border-collapse:collapse;font-size:0.75rem;text-align:left;line-height:1.45;">
                <thead>
                  <tr style="background:var(--surface-3);border-bottom:1px solid var(--border);">
                    {el.headers.map((h: string, hIdx: number) => (
                      <th
                        key={hIdx}
                        style={`padding:0.375rem 0.625rem;font-weight:600;color:var(--text-primary);text-align:${el.alignments[hIdx] || "left"};white-space:nowrap;border-right:${hIdx === el.headers.length - 1 ? "none" : "1px solid var(--border)"};`}
                      >
                        {renderContentWithBreaks(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {el.rows.map((row: string[], rIdx: number) => (
                    <tr
                      key={rIdx}
                      style={`border-bottom:${rIdx === el.rows.length - 1 ? "none" : "1px solid var(--border)"};background:${rIdx % 2 === 1 ? "var(--surface-2)" : "transparent"};`}
                    >
                      {row.map((cell: string, cIdx: number) => (
                        <td
                          key={cIdx}
                          style={`padding:0.375rem 0.625rem;color:var(--text-primary);text-align:${el.alignments[cIdx] || "left"};vertical-align:top;border-right:${cIdx === row.length - 1 ? "none" : "1px solid var(--border)"};`}
                        >
                          {renderContentWithBreaks(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (el.type === "spacer") {
          return <div key={idx} style="height:0.25rem;" />;
        }
        return <p key={idx} style="margin:0;color:var(--text-primary);user-select:text;-webkit-user-select:text;">{renderContentWithBreaks(el.content)}</p>;
      })}
    </div>
  );
});
