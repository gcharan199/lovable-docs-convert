import { supabase } from "@/integrations/supabase/client";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { processPdfClientSide, OcrProgress } from "./ocrProcessor";

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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
  update: { status: string; extracted_text?: string; page_count?: number; error_message?: string }
) {
  const { error } = await supabase.from("conversions").update(update).eq("id", id);
  if (error) throw new Error(`Failed to update conversion: ${error.message}`);
}

export async function processOcr(
  file: File,
  conversionId: string,
  onProgress: (progress: OcrProgress) => void
) {
  // Mark as processing in DB
  await updateConversion(conversionId, { status: "processing" });

  const result = await processPdfClientSide(file, onProgress);

  // Save extracted text and mark completed
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

export function generateWordDocument(text: string, filename: string) {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "--- Page Break ---") {
      paragraphs.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      continue;
    }

    const isHeading =
      trimmed.length > 0 &&
      trimmed.length < 80 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed);

    paragraphs.push(
      new Paragraph({
        heading: isHeading ? HeadingLevel.HEADING_1 : undefined,
        children: [
          new TextRun({
            text: trimmed,
            bold: isHeading,
            size: isHeading ? 28 : 22,
            font: "Calibri",
          }),
        ],
        spacing: { after: 120 },
      })
    );
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  Packer.toBlob(doc).then((blob) => {
    const docFilename = filename.replace(/\.pdf$/i, ".docx");
    saveAs(blob, docFilename);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
