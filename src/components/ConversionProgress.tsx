import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, FileText, ScanText, Check } from "lucide-react";
import type { OcrProgress } from "@/lib/ocrProcessor";

type Status = "pending" | "processing" | "completed" | "failed";

interface ConversionProgressProps {
  status: Status;
  filename: string;
  errorMessage?: string;
  ocrProgress?: OcrProgress | null;
}

interface Step {
  label: string;
  sublabel: string;
  state: "done" | "active" | "pending";
}

const ConversionProgress = ({
  status,
  filename,
  errorMessage,
  ocrProgress,
}: ConversionProgressProps) => {
  const steps: Step[] = [
    {
      label: "Upload",
      sublabel: "PDF uploaded",
      state: "done",
    },
    {
      label: "Extract",
      sublabel:
        ocrProgress?.stage === "ocr"
          ? (ocrProgress.pageLabel ?? "OCR scanning…")
          : ocrProgress?.stage === "extracting"
          ? (ocrProgress.pageLabel ?? "Reading text…")
          : status === "completed" || status === "failed"
          ? "Text extracted"
          : "Reading pages…",
      state:
        status === "completed"
          ? "done"
          : status === "processing"
          ? "active"
          : "pending",
    },
    {
      label: "Ready",
      sublabel: "Word document ready",
      state: status === "completed" ? "done" : "pending",
    },
  ];

  // Status badge config
  let badgeLabel = "Preparing…";
  let badgeClass = "bg-muted text-muted-foreground";
  let BadgeIcon = Loader2;
  let badgeSpin = true;

  if (status === "processing") {
    if (ocrProgress?.stage === "ocr") {
      badgeLabel = "OCR scanning";
      BadgeIcon = ScanText;
      badgeSpin = false;
    } else {
      badgeLabel = "Extracting text";
      BadgeIcon = Loader2;
    }
    badgeClass = "bg-primary/10 text-primary";
  } else if (status === "completed") {
    badgeLabel = "Complete";
    badgeClass = "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]";
    BadgeIcon = CheckCircle2;
    badgeSpin = false;
  } else if (status === "failed") {
    badgeLabel = "Failed";
    badgeClass = "bg-destructive/10 text-destructive";
    BadgeIcon = AlertCircle;
    badgeSpin = false;
  }

  const showOcrBar =
    status === "processing" && ocrProgress != null && ocrProgress.totalPages > 0;
  const ocrPct = ocrProgress?.percentage ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      <div
        className="p-5 rounded-2xl bg-card border border-border"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        {/* File info row */}
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border/60">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-foreground text-sm truncate">{filename}</p>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}
          >
            <BadgeIcon className={`w-3.5 h-3.5 ${badgeSpin ? "animate-spin" : ""}`} />
            {badgeLabel}
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-start gap-0 mb-1">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                {/* Connector + circle row */}
                <div className="flex items-center w-full">
                  {/* Left connector */}
                  <div
                    className={`flex-1 h-[2px] transition-all duration-500 ${
                      i === 0 ? "invisible" : step.state === "done" ? "bg-gradient-primary" : "bg-muted"
                    }`}
                  />
                  {/* Step circle */}
                  <div className="flex-shrink-0">
                    {step.state === "done" ? (
                      <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 18 }}
                        className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center"
                      >
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                      </motion.div>
                    ) : step.state === "active" ? (
                      <div className="relative w-7 h-7">
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                        </div>
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-primary"
                          animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                        />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full border-2 border-border bg-muted flex items-center justify-center">
                        <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      </div>
                    )}
                  </div>
                  {/* Right connector */}
                  <div
                    className={`flex-1 h-[2px] transition-all duration-500 ${
                      i === steps.length - 1
                        ? "invisible"
                        : step.state === "done"
                        ? "bg-gradient-primary"
                        : "bg-muted"
                    }`}
                  />
                </div>

                {/* Step label */}
                <div className="mt-2 text-center px-1">
                  <p
                    className={`text-xs font-display font-semibold transition-colors duration-300 ${
                      step.state === "done"
                        ? "text-foreground"
                        : step.state === "active"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* OCR page-level progress bar */}
        <AnimatePresence>
          {showOcrBar && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {ocrProgress?.stage === "ocr" && (
                      <ScanText className="w-3 h-3 text-primary" />
                    )}
                    {ocrProgress?.pageLabel}
                  </span>
                  <span className="text-[11px] font-semibold text-primary tabular-nums">
                    {ocrPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: `${ocrPct}%` }}
                    transition={{ ease: "easeOut", duration: 0.35 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success message */}
        <AnimatePresence>
          {status === "completed" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="mt-4 text-xs text-center text-[hsl(var(--success))] font-medium"
            >
              Your document is ready to download
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error message */}
        <AnimatePresence>
          {status === "failed" && errorMessage && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-sm text-destructive bg-destructive/10 rounded-xl p-3 leading-relaxed"
            >
              {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ConversionProgress;
