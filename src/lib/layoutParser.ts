import type { TextItem } from "pdfjs-dist/types/src/display/api";

// ─── Public types ────────────────────────────────────────────────────────────

export interface ParagraphElement {
  type: "paragraph";
  text: string;
  isHeading: boolean;
}

export interface TableElement {
  type: "table";
  /** rows[r][c] = cell text (empty string if the cell is empty) */
  rows: string[][];
  /** Number of columns */
  colCount: number;
}

export interface PageBreakElement {
  type: "pageBreak";
}

export type DocElement = ParagraphElement | TableElement | PageBreakElement;

// ─── Internal types ──────────────────────────────────────────────────────────

interface PositionedItem {
  str: string;
  x: number;
  /** Top-down Y (already inverted from PDF bottom-up) */
  y: number;
  width: number;
  height: number;
  fontName: string;
}

interface LineGroup {
  y: number;
  items: PositionedItem[];
}

// ─── Tuning knobs ────────────────────────────────────────────────────────────

/** Items within this many PDF units of the same Y are on the same line */
const ROW_TOLERANCE = 4;

/** Column X-positions that are within this many PDF units are the same column */
const COL_TOLERANCE = 18;

/** A table must have at least this many columns */
const MIN_TABLE_COLS = 2;

/** A table must span at least this many rows */
const MIN_TABLE_ROWS = 2;

/** Non-whitespace characters needed for an ALL-CAPS line to be a heading */
const HEADING_MAX_LEN = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Merge two X buckets if their representative values are within COL_TOLERANCE.
 * Returns a sorted list of distinct column X-anchors.
 */
function mergeColumnBuckets(xValues: number[]): number[] {
  const sorted = [...xValues].sort((a, b) => a - b);
  const buckets: number[] = [];
  for (const x of sorted) {
    const last = buckets[buckets.length - 1];
    if (last === undefined || x - last > COL_TOLERANCE) {
      buckets.push(x);
    }
    // else: close enough — already covered by last bucket
  }
  return buckets;
}

/** Return the index of the nearest column bucket for a given X */
function nearestBucket(x: number, buckets: number[]): number {
  let best = 0;
  let bestDist = Math.abs(x - buckets[0]);
  for (let i = 1; i < buckets.length; i++) {
    const d = Math.abs(x - buckets[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Detect whether a text string looks like a heading */
function isHeadingText(text: string): boolean {
  const t = text.trim();
  return (
    t.length > 0 &&
    t.length < HEADING_MAX_LEN &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t)
  );
}

// ─── Step 1: Convert pdfjs TextItems to PositionedItems ──────────────────────

function toPositioned(items: Array<TextItem | { type: string }>, pageHeight: number): PositionedItem[] {
  const result: PositionedItem[] = [];
  for (const raw of items) {
    // Skip TextMarkedContent items (they have a `type` property, TextItem does not)
    if ("type" in raw) continue;
    const item = raw as TextItem;
    if (!item.str.trim()) continue; // skip whitespace-only fragments

    // PDF transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
    // translateX/Y are the bottom-left origin of the text in PDF coordinates (bottom-up)
    const x = item.transform[4];
    const yPdf = item.transform[5];
    // Convert to top-down by flipping: y_topdown = pageHeight - yPdf - height
    const y = pageHeight - yPdf - Math.abs(item.height);

    result.push({
      str: item.str,
      x,
      y,
      width: item.width,
      height: Math.abs(item.height),
      fontName: item.fontName,
    });
  }
  return result;
}

// ─── Step 2: Group items into horizontal lines ────────────────────────────────

function groupIntoLines(items: PositionedItem[]): LineGroup[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom
  const sorted = [...items].sort((a, b) => a.y - b.y);

  const lines: LineGroup[] = [];
  let currentLine: PositionedItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= ROW_TOLERANCE) {
      currentLine.push(item);
    } else {
      lines.push({
        y: currentY,
        items: currentLine.sort((a, b) => a.x - b.x),
      });
      currentLine = [item];
      currentY = item.y;
    }
  }
  lines.push({
    y: currentY,
    items: currentLine.sort((a, b) => a.x - b.x),
  });

  return lines;
}

// ─── Step 3: Segment lines into table blocks vs paragraph blocks ──────────────

interface TableBlock { kind: "table"; lines: LineGroup[] }
interface ParaBlock  { kind: "para";  lines: LineGroup[] }
type Block = TableBlock | ParaBlock;

/**
 * A run of lines is a table candidate when every line in the run has ≥ 2 items
 * AND the set of column X-anchors across all lines in the run has ≥ 2 shared buckets.
 *
 * Strategy: slide a window; whenever we find MIN_TABLE_ROWS consecutive multi-item
 * lines with consistent column alignment, extend the table block as far as it holds.
 */
function segmentIntoBlocks(lines: LineGroup[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    // Try to start a table block at i
    const tableLines = tryExtractTable(lines, i);
    if (tableLines !== null && tableLines.length >= MIN_TABLE_ROWS) {
      blocks.push({ kind: "table", lines: tableLines });
      i += tableLines.length;
    } else {
      // Emit a single-line paragraph block
      blocks.push({ kind: "para", lines: [lines[i]] });
      i++;
    }
  }

  return blocks;
}

/**
 * Starting at `start`, greedily extend a table block as long as:
 *   - each line has ≥ MIN_TABLE_COLS items
 *   - each new line's items align with the running set of column buckets
 * Returns null if < MIN_TABLE_ROWS lines qualify.
 */
function tryExtractTable(lines: LineGroup[], start: number): LineGroup[] | null {
  if (start >= lines.length) return null;

  const tableLines: LineGroup[] = [];
  let colBuckets: number[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.items.length < MIN_TABLE_COLS) break;

    const lineXs = line.items.map((it) => it.x);

    if (colBuckets.length === 0) {
      // First candidate line — initialise column buckets
      colBuckets = mergeColumnBuckets(lineXs);
      if (colBuckets.length < MIN_TABLE_COLS) break;
      tableLines.push(line);
    } else {
      // Check alignment: every item must be within COL_TOLERANCE of an existing bucket
      // AND the number of matched buckets must be ≥ MIN_TABLE_COLS
      const matched = lineXs.filter((x) =>
        colBuckets.some((b) => Math.abs(x - b) <= COL_TOLERANCE)
      );
      if (matched.length < MIN_TABLE_COLS) break;

      // Expand column buckets with any new X positions
      const combined = mergeColumnBuckets([...colBuckets, ...lineXs]);
      colBuckets = combined;
      tableLines.push(line);
    }
  }

  return tableLines.length >= MIN_TABLE_ROWS ? tableLines : null;
}

// ─── Step 4: Convert blocks to DocElements ────────────────────────────────────

function tableBlockToElement(block: TableBlock): TableElement {
  // Gather all column buckets from all rows in the block
  const allXs = block.lines.flatMap((l) => l.items.map((it) => it.x));
  const colBuckets = mergeColumnBuckets(allXs);
  const colCount = colBuckets.length;

  const rows: string[][] = block.lines.map((line) => {
    const cells = Array<string>(colCount).fill("");
    for (const item of line.items) {
      const col = nearestBucket(item.x, colBuckets);
      cells[col] = cells[col] ? cells[col] + " " + item.str : item.str;
    }
    return cells;
  });

  return { type: "table", rows, colCount };
}

function paraBlockToElements(block: ParaBlock): ParagraphElement[] {
  return block.lines.map((line) => {
    const text = line.items.map((it) => it.str).join(" ").trim();
    return {
      type: "paragraph",
      text,
      isHeading: isHeadingText(text),
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert an array of pdfjs `TextItem`s (from `page.getTextContent()`) into
 * a structured list of `DocElement`s: paragraphs and tables.
 *
 * @param items   - `textContent.items` array (may mix TextItem and TextMarkedContent)
 * @param pageHeight - The page height in PDF units (from `page.getViewport({ scale: 1 }).viewBox[3]`)
 */
export function buildDocElements(
  items: Array<TextItem | { type: string }>,
  pageHeight: number
): DocElement[] {
  const positioned = toPositioned(items, pageHeight);
  if (positioned.length === 0) return [];

  const lines = groupIntoLines(positioned);
  const blocks = segmentIntoBlocks(lines);

  const elements: DocElement[] = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      elements.push(tableBlockToElement(block));
    } else {
      elements.push(...paraBlockToElements(block));
    }
  }

  return elements;
}

/** Extract plain text from a DocElement array (used for DB storage and preview) */
export function elementsToText(elements: DocElement[]): string {
  return elements
    .map((el) => {
      if (el.type === "pageBreak") return "--- Page Break ---";
      if (el.type === "paragraph") return el.text;
      // table: join rows with tab-separated cells
      return el.rows.map((row) => row.join("\t")).join("\n");
    })
    .join("\n");
}
