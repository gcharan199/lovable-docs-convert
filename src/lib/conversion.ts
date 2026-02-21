import { supabase } from "@/integrations/supabase/client";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
} from "docx";
import { saveAs } from "file-saver";
import { processPdfClientSide, type OcrProgress } from "./ocrProcessor";
import type { DocElement } from "./layoutParser";

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ─── Supabase helpers ────────────────────────────────────────────────────────

export async function uploadPdf(file: File): Promise<{ filePath: string; publicUrl: string }> {
  const fileExt = file.name.split(".").pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  const { error } = await supabase.storage
    .from("pdf-uploads")
    .upload(filePath, file, { contentType: "application/pdf" });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from("pdf-uploads")
    .getPublicUrl(filePath);

  return { filePath, publicUrl: urlData.publicUrl };
}

export async function createConversion(filename: string, filePath: string, fileSize: number) {
  const { data, error } = await supabase
    .from("conversions")
    .insert({
      original_filename: filename,
      original_file_path: filePath,
      file_size: fileSize,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversion: ${error.message}`);
  return data;
}

export async function updateConversion(
  id: string,
  update: {
    status: string;
    extracted_text?: string;
    page_count?: number;
    error_message?: string;
  }
) {
  const { error } = await supabase.from("conversions").update(update).eq("id", id);
  if (error) throw new Error(`Failed to update conversion: ${error.message}`);
}

export async function processOcr(
  file: File,
  conversionId: string,
  onProgress: (progress: OcrProgress) => void
) {
  await updateConversion(conversionId, { status: "processing" });

  const result = await processPdfClientSide(file, onProgress);

  await updateConversion(conversionId, {
    status: "completed",
    extracted_text: result.text,
    page_count: result.pageCount,
  });

  return result;
}

export async function getConversions(ids?: string[]) {
  let query = supabase
    .from("conversions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch conversions: ${error.message}`);
  return data;
}

export async function getConversion(id: string) {
  const { data, error } = await supabase
    .from("conversions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Failed to fetch conversion: ${error.message}`);
  return data;
}

// ─── Word document generation ────────────────────────────────────────────────

/** Subtle border used on all table cells */
const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "AAAAAA",
} as const;

/** Build a docx Table from a TableElement's 2-D string array */
function buildTable(rows: string[][], colCount: number): Table {
  const docxRows = rows.map(
    (rowCells) =>
      new TableRow({
        children: rowCells.map(
          (cellText) =>
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: CELL_BORDER,
                bottom: CELL_BORDER,
                left: CELL_BORDER,
                right: CELL_BORDER,
              },
              width: {
                size: Math.floor(100 / colCount),
                type: WidthType.PERCENTAGE,
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: cellText.trim(),
                      size: 20, // 10pt
                      font: "Calibri",
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: docxRows,
  });
}

/**
 * Convert a DocElement array into a Word document and trigger a browser download.
 * Falls back gracefully: if `elements` is empty it falls back to the `fallbackText` plain-text path.
 */
export function generateWordDocument(
  elements: DocElement[],
  filename: string,
  fallbackText?: string
) {
  // If for some reason elements are empty, fall back to the old plain-text approach
  const docChildren: (Paragraph | Table)[] =
    elements.length > 0
      ? buildDocChildren(elements)
      : buildFallbackChildren(fallbackText ?? "");

  const doc = new Document({
    sections: [{ children: docChildren }],
  });

  Packer.toBlob(doc).then((blob) => {
    const docFilename = filename.replace(/\.pdf$/i, ".docx");
    saveAs(blob, docFilename);
  });
}

function buildDocChildren(elements: DocElement[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  for (const el of elements) {
    if (el.type === "pageBreak") {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      continue;
    }

    if (el.type === "table") {
      // Add a small spacing paragraph before the table if the previous child is not a break
      children.push(
        new Paragraph({ children: [new TextRun({ text: "" })], spacing: { before: 80 } })
      );
      children.push(buildTable(el.rows, el.colCount));
      // Spacing paragraph after the table
      children.push(
        new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 80 } })
      );
      continue;
    }

    // paragraph
    const text = el.text.trim();
    if (!text) continue;

    children.push(
      new Paragraph({
        heading: el.isHeading ? HeadingLevel.HEADING_1 : undefined,
        children: [
          new TextRun({
            text,
            bold: el.isHeading,
            size: el.isHeading ? 28 : 22,
            font: "Calibri",
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  return children;
}

/** Legacy plain-text path used when elements array is unavailable */
function buildFallbackChildren(text: string): (Paragraph | Table)[] {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "--- Page Break ---") {
        return new Paragraph({ pageBreakBefore: true, children: [] });
      }
      const isHeading =
        trimmed.length > 0 &&
        trimmed.length < 80 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed);
      return new Paragraph({
        heading: isHeading ? HeadingLevel.HEADING_1 : undefined,
        children: [
          new TextRun({ text: trimmed, bold: isHeading, size: isHeading ? 28 : 22, font: "Calibri" }),
        ],
        spacing: { after: 100 },
      });
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
