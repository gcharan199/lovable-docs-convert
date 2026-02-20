import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileType2,
  Download,
  Copy,
  Check,
  Moon,
  Sun,
  ScanText,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { useTheme } from "next-themes";
import FileDropZone from "@/components/FileDropZone";
import ConversionProgress from "@/components/ConversionProgress";
import ConversionHistory from "@/components/ConversionHistory";
import { Button } from "@/components/ui/button";
import {
  uploadPdf,
  createConversion,
  processOcr,
  getConversions,
  generateWordDocument,
  MAX_FILE_SIZE,
} from "@/lib/conversion";
import type { OcrProgress } from "@/lib/ocrProcessor";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Conversion = Database["public"]["Tables"]["conversions"]["Row"];

const SESSION_KEY = "grk_session_ids";

function getSessionIds(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function addSessionId(id: string) {
  const ids = getSessionIds();
  ids.unshift(id);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(ids.slice(0, 20)));
}

// Animation variants for staggered entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

const FEATURES = [
  {
    icon: ScanText,
    title: "OCR Technology",
    desc: "Reads both scanned and text-based PDFs with high accuracy",
  },
  {
    icon: ShieldCheck,
    title: "100% Private",
    desc: "All processing runs entirely in your browser — nothing is uploaded to a server",
  },
  {
    icon: FileText,
    title: "Multi-page Support",
    desc: "Converts every page into a single, well-structured Word document",
  },
];

const Index = () => {
  const { toast } = useToast();
  const { resolvedTheme, setTheme } = useTheme();

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<
    "pending" | "processing" | "completed" | "failed" | null
  >(null);
  const [currentFilename, setCurrentFilename] = useState("");
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [copied, setCopied] = useState(false);

  const loadConversions = useCallback(async () => {
    try {
      const ids = getSessionIds();
      if (ids.length === 0) { setConversions([]); return; }
      const data = await getConversions(ids);
      setConversions((data as Conversion[]) || []);
    } catch (e) {
      console.error("Failed to load conversions:", e);
    }
  }, []);

  useEffect(() => { loadConversions(); }, [loadConversions]);

  const handleFileSelect = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) return;

    setIsProcessing(true);
    setCurrentStatus("pending");
    setCurrentFilename(file.name);
    setExtractedText(null);
    setErrorMessage(undefined);
    setOcrProgress(null);

    try {
      const { filePath } = await uploadPdf(file);
      const conversion = await createConversion(file.name, filePath, file.size);
      addSessionId(conversion.id);

      setCurrentStatus("processing");
      const result = await processOcr(file, conversion.id, (progress) => {
        setOcrProgress(progress);
      });

      setCurrentStatus("completed");
      setExtractedText(result.text);
      toast({
        title: "Conversion complete!",
        description: result.usedOcr
          ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} processed with OCR.`
          : `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} extracted.`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
      setCurrentStatus("failed");
      setErrorMessage(msg);
      toast({ title: "Conversion failed", description: msg, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      loadConversions();
    }
  };

  const handleDownload = () => {
    if (extractedText && currentFilename) generateWordDocument(extractedText, currentFilename);
  };

  const handleReset = () => {
    setCurrentStatus(null);
    setCurrentFilename("");
    setExtractedText(null);
    setErrorMessage(undefined);
    setOcrProgress(null);
  };

  const handleCopy = async () => {
    if (!extractedText) return;
    await navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = extractedText
    ? extractedText.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = extractedText ? extractedText.length : 0;
  const isIdle = !currentStatus;

  return (
    <div className="min-h-screen bg-dot-grid bg-gradient-surface hero-glow">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="w-full border-b border-border/60 bg-background/75 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <motion.div
            className="flex items-center gap-2.5"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
              <FileType2 className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <span className="font-display font-semibold text-[15px] text-foreground tracking-tight">
              GRK's PDF Converter
            </span>
          </motion.div>

          <motion.button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
            aria-label="Toggle dark mode"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            whileTap={{ scale: 0.9 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {resolvedTheme === "dark" ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -30, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 30, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Sun className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 30, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -30, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Moon className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-5 pt-14 pb-24">

        {/* Hero */}
        <motion.div
          className="text-center mb-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/15 mb-5">
              <ScanText className="w-3 h-3" />
              OCR-powered · Open Source · Free
            </span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="font-display text-4xl sm:text-5xl md:text-[56px] font-bold text-foreground leading-[1.1] tracking-tight mb-4"
          >
            Convert PDF to Word
            <br />
            <span className="text-gradient">Effortlessly.</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-muted-foreground text-[17px] leading-relaxed max-w-[480px] mx-auto"
          >
            Drop in any PDF — scanned or digital — and get a clean,
            editable&nbsp;Word document. No account needed.
          </motion.p>
        </motion.div>

        {/* ── Conversion area ────────────────────────────────── */}
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Upload zone / Progress card */}
          <AnimatePresence mode="wait">
            {isIdle ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <FileDropZone onFileSelect={handleFileSelect} isProcessing={isProcessing} />
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <ConversionProgress
                  status={currentStatus!}
                  filename={currentFilename}
                  errorMessage={errorMessage}
                  ocrProgress={ocrProgress}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <AnimatePresence>
            {currentStatus === "completed" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-center gap-3 flex-wrap"
              >
                <motion.div whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }}>
                  <Button
                    onClick={handleDownload}
                    className="bg-gradient-primary text-white shadow-glow-lg hover:shadow-glow hover:opacity-95 transition-all duration-200 px-7 h-11 text-[15px] font-display font-semibold gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download .docx
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="h-11 px-6 text-[15px] font-display font-medium border-border/80 hover:border-primary/30 transition-all duration-200"
                  >
                    Convert Another
                  </Button>
                </motion.div>
              </motion.div>
            )}

            {currentStatus === "failed" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center"
              >
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="h-11 px-6 text-[15px] font-display font-medium"
                  >
                    Try Again
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text preview */}
          <AnimatePresence>
            {extractedText && currentStatus === "completed" && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-display text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Text Preview
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
                    </span>
                    <motion.button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
                      whileTap={{ scale: 0.95 }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {copied ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-1 text-[hsl(var(--success))]"
                          >
                            <Check className="w-3.5 h-3.5" /> Copied!
                          </motion.span>
                        ) : (
                          <motion.span
                            key="copy"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-1"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>
                <div
                  className="p-5 rounded-xl bg-card border border-border text-sm text-foreground leading-[1.7] max-h-56 overflow-y-auto whitespace-pre-wrap font-body"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  {extractedText.slice(0, 2000)}
                  {extractedText.length > 2000 && (
                    <span className="text-muted-foreground italic">
                      {" "}… (preview truncated — full text included in .docx)
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feature cards — only visible on idle */}
          <AnimatePresence>
            {isIdle && (
              <motion.div
                key="features"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2"
              >
                {FEATURES.map((f, i) => (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                    className="p-4 rounded-xl bg-card/70 border border-border/70 hover:border-primary/20 hover:bg-card transition-all duration-200 cursor-default"
                    style={{ boxShadow: "var(--shadow-xs)" }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <f.icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="font-display text-[13px] font-semibold text-foreground mb-1">
                      {f.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History */}
        <div className="max-w-2xl mx-auto mt-14">
          <ConversionHistory conversions={conversions} />
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-6">
        <div className="max-w-4xl mx-auto px-5 text-center text-xs text-muted-foreground/70">
          GRK's PDF Converter — open source, runs entirely in your browser
        </div>
      </footer>
    </div>
  );
};

export default Index;
