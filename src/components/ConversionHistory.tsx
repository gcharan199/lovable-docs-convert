import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, Clock, FileType2, History } from "lucide-react";
import { formatFileSize, generateWordDocument } from "@/lib/conversion";
import { Button } from "@/components/ui/button";

interface Conversion {
  id: string;
  original_filename: string;
  status: string;
  extracted_text: string | null;
  page_count: number | null;
  file_size: number | null;
  created_at: string;
}

interface ConversionHistoryProps {
  conversions: Conversion[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: { label: "Done", className: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  processing: { label: "Processing", className: "bg-primary/10 text-primary" },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
};

const ConversionHistory = ({ conversions }: ConversionHistoryProps) => {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-[15px] font-semibold text-foreground">
          Recent Conversions
        </h2>
        {conversions.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">This session</span>
        )}
      </div>

      {conversions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border border-dashed border-border bg-muted/20"
        >
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <History className="w-5 h-5 text-muted-foreground/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-display font-medium text-muted-foreground">
              No conversions yet
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-[220px]">
              Converted files appear here during your session
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {conversions.map((conv, i) => {
              const badge = statusConfig[conv.status] ?? statusConfig.pending;
              return (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  layout
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-card border border-border/80 hover:border-primary/20 hover:bg-muted/20 transition-all duration-200 group"
                  style={{ boxShadow: "var(--shadow-xs)" }}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-display font-medium text-foreground text-[13px] truncate leading-tight">
                      {conv.original_filename}
                    </p>
                    <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground">
                      {conv.file_size != null && <span>{formatFileSize(conv.file_size)}</span>}
                      {conv.page_count != null && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>
                            {conv.page_count} {conv.page_count === 1 ? "page" : "pages"}
                          </span>
                        </>
                      )}
                      <span className="opacity-40">·</span>
                      <span>{new Date(conv.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    {conv.status === "completed" && conv.extracted_text && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          generateWordDocument(conv.extracted_text!, conv.original_filename)
                        }
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                        title="Re-download .docx"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <FileType2 className="w-3 h-3 -ml-1" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};

export default ConversionHistory;
