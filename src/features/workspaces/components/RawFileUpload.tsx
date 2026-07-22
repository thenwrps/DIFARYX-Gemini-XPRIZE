import React, { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadRawData } from '../../../services/uploadService';
import { type UploadedSignalRun } from '../../../data/uploadedSignalRuns';

interface RawFileUploadProps {
  technique: string;
  onUploadSuccess: (run: UploadedSignalRun) => void;
  className?: string;
}

export function RawFileUpload({ technique, onUploadSuccess, className = '' }: RawFileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement | null>(null);

  const getAcceptedExtensions = (tech: string) => {
    switch (tech.toLowerCase()) {
      case 'xrd':
        return '.csv, .txt, .xy, .dat';
      case 'xps':
      case 'ftir':
      case 'raman':
        return '.csv, .txt, .dat';
      default:
        return '.csv, .txt, .xy, .dat';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    setUploading(true);
    setProgress(15);
    setError(null);
    setSuccess(false);
    setFileName(file.name);

    // Simulate progress upload increments
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 200);

    try {
      const run = await uploadRawData(file, technique);
      clearInterval(progressInterval);
      setProgress(100);
      setSuccess(true);
      
      // Delay briefly to allow user to see 100% success state
      setTimeout(() => {
        onUploadSuccess(run);
        setUploading(false);
        setProgress(0);
      }, 800);
    } catch (err: any) {
      clearInterval(progressInterval);
      setUploading(false);
      setProgress(0);
      setError(err.message || 'Error occurred during raw file upload.');
      console.error('[raw-file-upload] Processing failed:', err);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void processFile(e.target.files[0]);
    }
  };

  const onBrowseClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          dragActive
            ? 'border-primary bg-primary/5 scale-[0.99] backdrop-blur-sm'
            : 'border-border bg-surface/40 hover:border-primary/50 hover:bg-surface-hover/20'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          id={`raw-file-upload-input-${technique}`}
          accept={getAcceptedExtensions(technique)}
          onChange={handleFileInput}
          disabled={uploading}
          className="hidden"
        />

        {!uploading && !success && (
          <div className="flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-primary transition-transform duration-300 hover:scale-105">
              <Upload size={24} />
            </div>
            
            <button
              type="button"
              onClick={onBrowseClick}
              className="text-sm font-bold text-text-main hover:text-primary transition-colors focus:outline-none"
            >
              Drag & drop file here or <span className="text-primary underline">browse</span>
            </button>
            
            <p className="mt-2 text-xs text-text-muted">
              Supported formats for {technique.toUpperCase()}: {getAcceptedExtensions(technique)}
            </p>
            
            <p className="mt-4 text-[10px] max-w-xs text-text-dim leading-relaxed">
              DIFARYX interprets uploaded signal features as validation-limited. Absolute structural characteristics require additional complementary analysis.
            </p>
          </div>
        )}

        {uploading && (
          <div className="flex flex-col items-center w-full max-w-xs">
            <Loader2 size={32} className="text-primary animate-spin mb-3" />
            <p className="text-sm font-semibold text-text-main">Processing file: {fileName}</p>
            <p className="text-xs text-text-muted mt-1">Executing analytics pipeline...</p>
            
            {/* Progress Bar Container */}
            <div className="w-full bg-border rounded-full h-1.5 mt-4 overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-text-dim mt-1.5 font-mono">{progress}% completed</span>
          </div>
        )}

        {success && (
          <div className="flex flex-col items-center">
            <CheckCircle2 size={32} className="text-emerald-500 mb-3 animate-bounce" />
            <p className="text-sm font-semibold text-text-main">Signal processing initiated!</p>
            <p className="text-xs text-emerald-600/80 mt-1">File {fileName} loaded successfully.</p>
            <p className="text-[10px] text-text-dim mt-2 max-w-xs">
              Injecting dataset points into workspace parameters. Bounded interpretations are loading.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/50 p-3 text-left w-full">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-800">Upload failed</p>
              <p className="text-[11px] text-red-700 leading-snug mt-0.5">{error}</p>
              <button 
                type="button" 
                onClick={onBrowseClick}
                className="text-[10px] font-bold text-red-800 underline mt-1 hover:text-red-900 block focus:outline-none"
              >
                Try selecting another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
