import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, 
  FileText, 
  Image, 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  ArrowRight,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { StagedUploadFile, DocumentType } from '../../types';
import { uploadDocuments } from '../../services/api/documentService';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'batch' | 'single'>('batch');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Initial staged realistic files matching Stitch prompt
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([
    {
      id: 'stg-1',
      name: 'invoice_oct_01.pdf',
      size: 2516582,
      formattedSize: '2.4 MB',
      mimeType: 'application/pdf',
      detectedType: 'Invoice',
      status: 'Ready',
      progress: 0,
    },
    {
      id: 'stg-2',
      name: 'receipt_store_014.jpg',
      size: 1258291,
      formattedSize: '1.2 MB',
      mimeType: 'image/jpeg',
      detectedType: 'Receipt',
      status: 'Ready',
      progress: 0,
    },
    {
      id: 'stg-3',
      name: 'application_form_102.pdf',
      size: 860160,
      formattedSize: '840 KB',
      mimeType: 'application/pdf',
      detectedType: 'Form',
      status: 'Ready',
      progress: 0,
    },
  ]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const detectTypeFromFileName = (fileName: string): DocumentType => {
    const lower = fileName.toLowerCase();
    if (lower.includes('invoice') || lower.includes('bill') || lower.includes('inv')) return 'Invoice';
    if (lower.includes('receipt') || lower.includes('store') || lower.includes('target') || lower.includes('mart')) return 'Receipt';
    if (lower.includes('form') || lower.includes('claim') || lower.includes('tax') || lower.includes('app')) return 'Form';
    return 'Invoice';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addFiles = (files: File[]) => {
    const newItems: StagedUploadFile[] = files.map((file, idx) => ({
      id: `stg-${Date.now()}-${idx}`,
      file,
      name: file.name,
      size: file.size,
      formattedSize: formatFileSize(file.size),
      mimeType: file.type || 'application/octet-stream',
      detectedType: detectTypeFromFileName(file.name),
      status: 'Ready',
      progress: 0,
    }));

    if (mode === 'single') {
      setStagedFiles(newItems.slice(0, 1));
    } else {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
    setUploadSuccess(false);
  };

  const removeFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    setStagedFiles([]);
    setUploadSuccess(false);
  };

  const startUpload = async () => {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setOverallProgress(10);

    const uploadedDocs = await uploadDocuments(stagedFiles, (fileId, progress, status) => {
      setStagedFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, progress, status, speed: '2.1 MB/s' } : f))
      );
      setOverallProgress((prev) => Math.min(95, prev + 25));
    });

    setOverallProgress(100);
    setUploading(false);
    
    if (uploadedDocs.length > 0) {
      setUploadSuccess(true);
    } else {
      setUploadSuccess(false);
      alert('Upload failed. Please check your connection and try again.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
          Upload Documents
        </h1>
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
          Upload one or multiple documents for automated cloud OCR, classification, and metadata extraction.
        </p>
      </div>

      {/* Automatic Classification Info Banner */}
      <div className="p-3.5 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A20] border border-[#BFDBFE] dark:border-[#1E40AF] flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-[#1E40AF] dark:text-[#60A5FA] flex-shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <span className="font-semibold text-[#1E40AF] dark:text-[#93C5FD]">
            Automatic Classification Enabled:
          </span>{' '}
          <span className="text-[#334155] dark:text-[#CBD5E1]">
            You do not need to specify document types manually. Prashn's AWS Textract pipeline will automatically detect invoices, receipts, and structured forms upon ingestion.
          </span>
        </div>
      </div>

      {/* Two Upload Modes Switch */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('batch')}
          className={`px-4 py-2 text-[13px] font-medium rounded-[4px] border transition-colors ${
            mode === 'batch'
              ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
              : 'bg-white dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8] border-[#CBD5E1] dark:border-[#475569] hover:bg-[#F8FAFC]'
          }`}
        >
          Batch Upload ({stagedFiles.length})
        </button>
        <button
          onClick={() => {
            setMode('single');
            if (stagedFiles.length > 1) {
              setStagedFiles(stagedFiles.slice(0, 1));
            }
          }}
          className={`px-4 py-2 text-[13px] font-medium rounded-[4px] border transition-colors ${
            mode === 'single'
              ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
              : 'bg-white dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8] border-[#CBD5E1] dark:border-[#475569] hover:bg-[#F8FAFC]'
          }`}
        >
          Single Document Quick Inspect
        </button>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-[6px] p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-[#1E40AF] bg-[#EFF6FF] dark:bg-[#1E3A8A30]'
            : 'border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E293B] hover:border-[#1E40AF] hover:bg-[#F8FAFC] dark:hover:bg-[#243248]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={mode === 'batch'}
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="w-12 h-12 rounded-full bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA] flex items-center justify-center mx-auto mb-3">
          <UploadCloud className="w-6 h-6" />
        </div>
        <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
          Drag and drop your documents here, or{' '}
          <span className="text-[#1E40AF] dark:text-[#60A5FA] underline underline-offset-2">
            browse files from computer
          </span>
        </p>
        <p className="text-[12px] text-[#64748B] dark:text-[#94A3B8] mt-1 font-mono">
          Supported formats: PDF, JPG, JPEG, PNG (Max 25MB per file, up to 50 files per batch)
        </p>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#059669] mt-3">
          <ShieldCheck className="w-4 h-4" />
          <span>Files are encrypted in transit and stored in SOC2-compliant AWS S3 bucket.</span>
        </div>
      </div>

      {/* Selected Documents Staging List */}
      {stagedFiles.length > 0 && (
        <Card
          title={
            <div className="flex items-center justify-between w-full">
              <span className="text-[14px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Selected Documents ({stagedFiles.length} ready to process)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={clearAll}
                  disabled={uploading}
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<UploadCloud className="w-3.5 h-3.5" />}
                  onClick={startUpload}
                  loading={uploading}
                >
                  Upload All ({stagedFiles.length})
                </Button>
              </div>
            </div>
          }
          noPadding
        >
          {/* Active In-Flight Upload Simulation Progress Bar */}
          {uploading && (
            <div className="p-4 bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155]">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium text-[#1E40AF] dark:text-[#60A5FA] flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Uploading & sending to AWS SQS queue...
                </span>
                <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC] font-semibold tabular-nums">
                  {overallProgress}%
                </span>
              </div>
              <div className="w-full bg-[#E2E8F0] dark:bg-[#334155] h-2 rounded-[2px] overflow-hidden">
                <div
                  className="bg-[#1E40AF] h-full rounded-[2px] transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Staged Files List */}
          <div className="divide-y divide-[#F1F5F9] dark:divide-[#2B3B52]">
            {stagedFiles.map((file) => {
              const isPdf = file.name.toLowerCase().endsWith('.pdf');
              return (
                <div
                  key={file.id}
                  className="p-3.5 flex items-center justify-between gap-4 hover:bg-[#F8FAFC] dark:hover:bg-[#243248] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A30] text-[#1E40AF] dark:text-[#60A5FA] flex-shrink-0">
                      {isPdf ? <FileText className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="text-[13px] font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                        {file.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                        <span>{file.formattedSize}</span>
                        <span>·</span>
                        <span className="px-1.5 py-0.2 rounded-[2px] bg-[#F1F5F9] dark:bg-[#334155] text-[#334155] dark:text-[#CBD5E1]">
                          Auto-classify: {file.detectedType}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status / Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {file.status === 'Ready' && (
                      <span className="text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                        Ready to upload
                      </span>
                    )}

                    {file.status === 'Uploading' && (
                      <span className="text-[11px] font-mono text-[#0284C7] flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Uploading ({file.progress}%)
                      </span>
                    )}

                    {file.status === 'Completed' && (
                      <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                        100% Ingested
                      </Badge>
                    )}

                    {!uploading && (
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 rounded-[4px] text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] dark:hover:bg-[#88133740] transition-colors"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Post-Upload Success State Card */}
      {uploadSuccess && (
        <Card className="bg-[#ECFDF5] dark:bg-[#064E3B20] border-[#A7F3D0] dark:border-[#065F46]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#059669] flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[14px] font-semibold text-[#065F46] dark:text-[#34D399]">
                  {stagedFiles.length} documents queued successfully!
                </h4>
                <p className="text-[12px] text-[#065F46] dark:text-[#A7F3D0] mt-0.5">
                  Live extraction status and AWS pipeline stages are visible in Processing view.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate('/documents')}
              >
                View in Documents Table
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                iconPosition="right"
                onClick={() => navigate('/processing')}
              >
                Go to Processing Queue
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
