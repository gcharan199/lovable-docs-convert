import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { MAX_FILE_SIZE, formatFileSize } from "@/lib/conversion";

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

const FileDropZone = ({ onFileSelect, isProcessing }: FileDropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") {
        setSizeError("Only PDF files are supported.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setSizeError(
          `File is too large (${formatFileSize(file.size)}). Maximum is 20 MB.`
        );
        return;
      }
      setSizeError(null);
      setSelectedFile(file);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSelect(file);
      e.target.value = "";
    },
    [validateAndSelect]
  );

  const clearFile = () => {
    setSelectedFile(null);
    setSizeError(null);
  };

  return (
    <div className="w-full space-y-2">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.label
            key="dropzone"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              group relative flex flex-col items-center justify-center
              w-full min-h-[260px] rounded-2xl border-2 border-dashed
              cursor-pointer transition-all duration-250 ease-out overflow-hidden
              ${sizeError
                ? "border-destructive/50 bg-destructive/[0.03]"
                : isDragging
                ? "border-primary bg-primary/[0.04] scale-[1.01]"
                : "border-border hover:border-primary/40 bg-card hover:bg-muted/30"}
            `}
            style={{ boxShadow: isDragging ? "var(--shadow-glow)" : "var(--shadow-sm)" }}
          >
            {/* Subtle animated gradient fill on drag */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  className="absolute inset-0 bg-gradient-primary opacity-[0.04] pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>

            <input
              type="file"
              accept=".pdf"
              onChange={handleFileInput}
              className="hidden"
              disabled={isProcessing}
            />

            <div className="flex flex-col items-center gap-4 px-6 text-center relative z-10">
              <motion.div
                animate={
                  sizeError
                    ? { scale: 1 }
                    : isDragging
                    ? { scale: 1.12, y: -6 }
                    : { scale: 1, y: 0 }
                }
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200
                  ${sizeError
                    ? "bg-destructive/10"
                    : isDragging
                    ? "bg-gradient-primary shadow-glow-lg"
                    : "bg-gradient-primary shadow-glow group-hover:shadow-glow-lg"}
                `}
              >
                {sizeError ? (
                  <AlertCircle className="w-6 h-6 text-destructive" />
                ) : (
                  <Upload className="w-6 h-6 text-white" />
                )}
              </motion.div>

              {sizeError ? (
                <div>
                  <p className="text-[15px] font-display font-semibold text-foreground">
                    File rejected
                  </p>
                  <p className="text-sm text-destructive mt-1">{sizeError}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Click to choose a different file
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[16px] font-display font-semibold text-foreground">
                    {isDragging ? "Release to convert" : "Drop your PDF here"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or{" "}
                    <span className="text-primary underline underline-offset-2">
                      click to browse
                    </span>
                    {" "}· up to 20 MB
                  </p>
                </div>
              )}
            </div>
          </motion.label>
        ) : (
          <motion.div
            key="selected"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-card border border-border"
            style={{ boxShadow: "var(--shadow-md)" }}
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-foreground text-sm truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            {!isProcessing && (
              <motion.button
                onClick={clearFile}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FileDropZone;
