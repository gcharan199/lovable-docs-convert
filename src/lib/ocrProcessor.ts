import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { createWorker } from "tesseract.js";

import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

import {
  buildDocElements,
  elementsToText,
  type DocElement,
  type ParagraphElement,
} from "./layoutParser";

// ─── Progress reporting ──────────────────────────────────────────────────────

export interface OcrProgress {
  page: number;
  totalPages: number;
  percentage: number;
  stage: "loading" | "extracting" | "ocr" | "done";
  pageLabel?: string;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface OcrResult {
  /** Structured layout elements (paragraphs + tables) for Word doc generation */
  elements: DocElement[];
  /** Flat text for DB storage and the text preview UI */
  text: string;
  pageCount: number;
  usedOcr: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum embedded-text characters for a page to be considered digital (not scanned) */
const TEXT_THRESHOLD = 30;

// ─── Main export ─────────────────────────────────────────────────────────────

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

  // Collect per-page elements; pageBreak sentinels are inserted between pages
  const allElements: DocElement[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const basePercentage = Math.round(((pageNum - 1) / totalPages) * 100);

    onProgress({
      page: pageNum,
      totalPages,
      percentage: basePercentage,
      stage: "extracting",
      pageLabel: `Reading page ${pageNum} of ${totalPages}`,
    });

    // Insert page-break sentinel between pages (not before first page)
    if (pageNum > 1) {
      allElements.push({ type: "pageBreak" });
    }

    const page = await pdf.getPage(pageNum);

    // Use scale-1 viewport to get page dimensions in PDF user units
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.viewBox[3]; // bottom-up height in PDF units

    // ── Try embedded text first ───────────────────────────────────────────
    const textContent = await page.getTextContent();

    // Quick check: is there meaningful embedded text?
    const embeddedRaw = textContent.items
      .filter((it): it is TextItem => !("type" in it))
      .map((it) => it.str)
      .join("")
      .trim();

    if (embeddedRaw.length >= TEXT_THRESHOLD) {
      // ── Digital page: use layout parser ─────────────────────────────────
      const pageElements = buildDocElements(
        textContent.items as Array<TextItem | { type: string }>,
        pageHeight
      );
      allElements.push(...pageElements);
    } else {
      // ── Scanned / image-only page: OCR ───────────────────────────────────
      usedOcr = true;

      if (!tesseractWorker) {
        tesseractWorker = await createWorker("eng", 1, {
          logger: () => {},
        });
      }

      onProgress({
        page: pageNum,
        totalPages,
        percentage: basePercentage,
        stage: "ocr",
        pageLabel: `OCR scanning page ${pageNum} of ${totalPages}`,
      });

      const scale = 2;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      const {
        data: { text: ocrText },
      } = await tesseractWorker.recognize(canvas);

      canvas.remove();

      // Convert OCR lines to paragraph elements
      const ocrLines = ocrText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of ocrLines) {
        const para: ParagraphElement = {
          type: "paragraph",
          text: line,
          isHeading:
            line.length > 0 &&
            line.length < 80 &&
            line === line.toUpperCase() &&
            /[A-Z]/.test(line),
        };
        allElements.push(para);
      }
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

  const text = elementsToText(allElements);

  return { elements: allElements, text, pageCount: totalPages, usedOcr };
}
