import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// Point to the pdfjs worker bundled by Vite
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface OcrProgress {
  page: number;
  totalPages: number;
  percentage: number;
  stage: "loading" | "extracting" | "ocr" | "done";
  pageLabel?: string;
}

export interface OcrResult {
  text: string;
  pageCount: number;
  usedOcr: boolean;
}

// Pages with fewer than this many characters are treated as image-only
const TEXT_THRESHOLD = 30;

export async function processPdfClientSide(
  file: File,
  onProgress: (progress: OcrProgress) => void
): Promise<OcrResult> {
  onProgress({ page: 0, totalPages: 0, percentage: 0, stage: "loading" });

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  let tesseractWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let usedOcr = false;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const basePercentage = Math.round(((pageNum - 1) / totalPages) * 100);

    onProgress({
      page: pageNum,
      totalPages,
      percentage: basePercentage,
      stage: "extracting",
      pageLabel: `Reading page ${pageNum} of ${totalPages}`,
    });

    const page = await pdf.getPage(pageNum);

    // Try embedded text first
    const textContent = await page.getTextContent();
    const embeddedText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();

    if (embeddedText.length >= TEXT_THRESHOLD) {
      pageTexts.push(embeddedText);
    } else {
      // Image-only page — OCR it
      usedOcr = true;

      if (!tesseractWorker) {
        tesseractWorker = await createWorker("eng", 1, {
          logger: () => {}, // suppress verbose logs
        });
      }

      onProgress({
        page: pageNum,
        totalPages,
        percentage: basePercentage,
        stage: "ocr",
        pageLabel: `OCR scanning page ${pageNum} of ${totalPages}`,
      });

      // Render page to canvas
      const scale = 2; // higher scale = better OCR accuracy
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const {
        data: { text: ocrText },
      } = await tesseractWorker.recognize(canvas);
      pageTexts.push(ocrText.trim());

      canvas.remove();
    }
  }

  if (tesseractWorker) {
    await tesseractWorker.terminate();
  }

  onProgress({
    page: totalPages,
    totalPages,
    percentage: 100,
    stage: "done",
    pageLabel: "Processing complete",
  });

  // Join pages with a separator that the Word generator recognises
  const fullText = pageTexts
    .map((t, i) => (i === 0 ? t : `--- Page Break ---\n${t}`))
    .join("\n\n");

  return { text: fullText, pageCount: totalPages, usedOcr };
}
