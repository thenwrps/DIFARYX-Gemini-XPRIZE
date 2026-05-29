import React from 'react';
import { X, FileText } from 'lucide-react';
import { RawFileUpload } from './RawFileUpload';
import { type UploadedSignalRun } from '../../data/uploadedSignalRuns';

interface RawFileUploadModalProps {
  open: boolean;
  onClose: () => void;
  technique: string;
  onUploadSuccess: (run: UploadedSignalRun) => void;
}

export function RawFileUploadModal({ open, onClose, technique, onUploadSuccess }: RawFileUploadModalProps) {
  if (!open) return null;

  const handleUploadSuccess = (run: UploadedSignalRun) => {
    onUploadSuccess(run);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg flex flex-col rounded-xl border border-border bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5 text-primary">
              <FileText size={16} />
            </div>
            <h2 className="text-sm font-bold text-text-main">
              Upload {technique.toUpperCase()} Signal Evidence
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 min-h-[300px]">
          <p className="text-xs text-text-muted mb-4 leading-relaxed">
            Import experimental raw data files (.csv, .txt, .xy, or .dat) to evaluate analytical peaks, baseline properties, and signal patterns in the current workspace.
          </p>

          <RawFileUpload 
            technique={technique} 
            onUploadSuccess={handleUploadSuccess} 
          />
        </div>

        {/* Modal Footer */}
        <div className="border-t border-border px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-4 text-xs font-semibold text-text-main hover:bg-surface-hover transition-colors focus:outline-none"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
