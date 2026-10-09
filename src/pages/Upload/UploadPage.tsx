import React, { useState, useRef, useEffect } from 'react';
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
import type { StagedUploadFile, DocumentType, DocumentItem } from '../../types';
import { uploadDocuments, getDocument, retryDocument } from '../../services/api/documentService';
import { getUploadValidationError } from '../../services/uploadValidation';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const [mode, setMode] = useState<'batch' | 'single'>('batch');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [results, setResults] = useState<DocumentItem[]>([]);
  const [autoOpenId, setAutoOpenId] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);

  useEffect(() => {
    if (results.length) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [results.length]);

  const pendingKey = results.filter(doc => !['Completed', 'Failed'].includes(doc.status)).map(doc => doc.id).join(',');
  useEffect(() => {
    if (!pendingKey) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const documents = await Promise.all(pendingKey.split(',').map(id => getDocument(id, controller.signal)));
        if (disposed) return;
        const missing = documents.some(doc => !doc);
        setTrackingError(missing ? 'An uploaded document is no longer available. Check the Documents list.' : '');
        setResults(current => current.map(doc => documents.find(updated => updated?.id === doc.id) || doc));
      } catch (error) {
        if (disposed) return;
        setTrackingError(error instanceof Error ? error.message : 'Unable to refresh processing status. Retrying…');
      }
      if (!disposed) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [pendingKey]);

  useEffect(() => {
    if (autoOpenId && results.some(doc => doc.id === autoOpenId && doc.status === 'Completed')) navigate(`/documents/${autoOpenId}`);
  }, [autoOpenId, results, navigate]);

  const retryResult = async (id: string) => {
    setRetryingId(id); setTrackingError('');
    try {
      const updated = await retryDocument(id);
      if (updated) setResults(current => current.map(doc => doc.id === id ? updated : doc));
      else setTrackingError('This document is no longer available.');
    } catch (error) { setTrackingError(error instanceof Error ? error.message : 'Unable to retry processing'); }
    finally { setRetryingId(null); }
  };

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
      e.target.value = '';
    }
  };

  const detectTypeFromFileName = (fileName: string): DocumentType => {
    const lower = fileName.toLowerCase();
    if (lower.includes('invoice') || lower.includes('bill') || lower.includes('inv')) return 'Invoice';
    if (lower.includes('receipt') || lower.includes('store') || lower.includes('target') || lower.includes('mart')) return 'Receipt';
    if (lower.includes('form') || lower.includes('claim') || lower.includes('tax') || lower.includes('app')) return 'Form';
    return 'Unknown';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addFiles = (files: File[]) => {
    if (uploading) return;
    if (mode === 'batch' && stagedFiles.length + files.length > 20) { setUploadMessage('Select at most 20 files per batch.'); return; }
    setAutoOpenId(null);
    const newItems: StagedUploadFile[] = files.map((file, idx) => ({
      id: `stg-${Date.now()}-${idx}`,
      file,
      name: file.name,
      size: file.size,
      formattedSize: formatFileSize(file.size),
      mimeType: file.type || 'application/octet-stream',
      detectedType: detectTypeFromFileName(file.name),
      status: getUploadValidationError(file) ? 'Failed' : 'Ready',
      error: getUploadValidationError(file) || undefined,
      progress: 0,
    }));

    if (mode === 'single') {
      setStagedFiles(newItems.slice(0, 1));
    } else {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
    setUploadMessage('');
  };

  const removeFile = (id: string) => {
    setAutoOpenId(null);
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    setStagedFiles([]);
    setResults([]); setAutoOpenId(null); setUploadMessage(''); setTrackingError('');
  };

  const startUpload = async () => {
    const eligible = stagedFiles.filter(file => file.file && !['Uploaded', 'Completed'].includes(file.status) && !getUploadValidationError(file.file));
    if (!eligible.length) return;
    setUploading(true);
    setAutoOpenId(null);
    setUploadMessage('');
    setOverallProgress(0);
    let finished = 0;

    const uploadedDocs = await uploadDocuments(eligible, (fileId, progress, status, error) => {
      setStagedFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, progress, status, error } : f))
      );
      if (status === 'Uploaded' || status === 'Failed') {
        finished++;
        setOverallProgress(Math.round(finished / eligible.length * 100));
      }
    });

    setOverallProgress(100);
    setUploading(false);
    
    setResults(current => [...current, ...uploadedDocs.filter(doc => !current.some(existing => existing.id === doc.id))]);
    if (stagedFiles.length === 1 && uploadedDocs.length === 1) setAutoOpenId(uploadedDocs[0].id);
    if (uploadedDocs.length !== eligible.length) {
      setUploadMessage(`${uploadedDocs.length} of ${eligible.length} files uploaded. Retry the failed files using Upload / Retry Files.`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {uploadMessage && <p role="status" className="text-sm text-red-600">{uploadMessage}</p>}
      {/* Header */}
      <div className="pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
          Upload Documents
        </h1>
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
          Upload one or multiple documents for automated local OCR, classification, and metadata extraction.
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
            You do not need to specify document types manually. Prashn's local processing pipeline will automatically detect invoices, receipts, and structured forms upon ingestion.
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
          Supported formats: PDF, JPG, JPEG, PNG (Max 10 MB per file, up to 20 files per batch)
        </p>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#059669] mt-3">
          <ShieldCheck className="w-4 h-4" />
          <span>Original documents are stored locally and accessible only through your account.</span>
        </div>
      </div>

      {/* Selected Documents Staging List */}
      {stagedFiles.length > 0 && (
        <Card
          title={
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
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
                  disabled={!stagedFiles.some(file => file.file && !['Uploaded', 'Completed'].includes(file.status) && !getUploadValidationError(file.file))}
                >
                  Upload / Retry Files
                </Button>
              </div>
            </div>
          }
          noPadding
        >
          {/* Upload request progress */}
          {uploading && (
            <div className="p-4 bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155]">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium text-[#1E40AF] dark:text-[#60A5FA] flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Uploading documents for background processing...
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
                        <span>Type detected after processing</span>
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
                        Uploading...
                      </span>
                    )}

                    {['Uploaded', 'Completed'].includes(file.status) && (
                      <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                        Uploaded
                      </Badge>
                    )}
                    {file.status === 'Failed' && <span role="alert" className="max-w-[180px] text-[11px] text-red-600">{file.error || 'Upload failed. Remove and add the file to retry.'}</span>}

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

      {results.length > 0 && <section ref={resultsRef} aria-label="Processing results" className="space-y-4 scroll-mt-24">
        <div role="status" aria-live="polite" className="space-y-1">
          <h2 className="text-[18px] font-semibold">Processing Results</h2>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8]">
            {results.filter(doc => doc.status === 'Completed').length} of {results.length} documents ready.
            {autoOpenId ? ' Your result opens automatically when processing finishes.' : ' Completed results appear below automatically.'}
          </p>
        </div>
        {trackingError && <p role="alert" className="text-sm text-red-600">{trackingError}</p>}
        {results.map(doc => <Card key={doc.id} title={doc.name} subtitle={`${doc.type} · ${doc.pagesCount} pages`} headerAction={
          <Badge variant={doc.status === 'Completed' ? 'success' : doc.status === 'Failed' ? 'error' : 'info'}>{doc.status}</Badge>
        }>
          {doc.status === 'Failed' ? <div className="space-y-3">
            <p role="alert" className="text-sm text-red-600">{doc.failureReason || 'Processing failed. Try a clearer scan or an unlocked PDF.'}</p>
            <Button size="sm" onClick={() => retryResult(doc.id)} disabled={retryingId !== null} loading={retryingId === doc.id}>Retry Processing</Button>
          </div> : doc.status !== 'Completed' ? <p className="text-sm text-[#64748B] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />{doc.status}. Results will appear here when ready.
          </p> : <div className="space-y-4">
            <div className="max-h-[360px] overflow-y-auto overscroll-contain space-y-2 pr-1">
              {doc.extractedFields.map((field, index) => <div key={index} className="flex items-start justify-between gap-3 p-2 rounded border border-[#E2E8F0] dark:border-[#334155] text-[13px]">
                <span className="text-[#64748B] dark:text-[#94A3B8]">{field.label}{field.page ? ` · Page ${field.page}` : ''}</span>
                <span className="min-w-0 text-right whitespace-pre-wrap break-words font-medium">{field.value}</span>
              </div>)}
              {!doc.extractedFields.length && <div className="space-y-3">
                <p className="text-sm text-[#64748B]">No structured fields recognized. Extracted text is available below.</p>
                {doc.pages?.map(page => <div key={page.page} className="text-sm">
                  <p className="font-medium">Page {page.page}</p>
                  <p className="whitespace-pre-wrap break-words">{page.text.slice(0, 1000)}{page.text.length > 1000 ? '…' : ''}</p>
                </div>)}
              </div>}
            </div>
            {!!doc.lineItems?.length && <div className="overflow-x-auto">
              <table className="w-full text-[12px] text-left">
                <thead><tr><th className="p-2">Item</th><th className="p-2">Quantity</th><th className="p-2">Unit Price</th><th className="p-2">Amount</th></tr></thead>
                <tbody>{doc.lineItems.map(item => <tr key={item.id}><td className="p-2">{item.description}</td><td className="p-2">{item.quantity}</td><td className="p-2 whitespace-nowrap">{item.unitPrice}</td><td className="p-2 whitespace-nowrap">{item.amount}</td></tr>)}</tbody>
              </table>
            </div>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigate(`/documents/${doc.id}`)}>View Full Results</Button>
              <Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} iconPosition="right" onClick={() => navigate(`/documents/${doc.id}/qa`)}>Ask Questions</Button>
            </div>
          </div>}
        </Card>)}
      </section>}
    </div>
  );
};
