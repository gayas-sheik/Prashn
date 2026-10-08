import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  RotateCw, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  CheckCircle2, 
  MessageSquare, 
  Code, 
  Copy, 
  Check, 
  ExternalLink,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { DocumentItem } from '../../types';
import { getDocument, retryDocument, deleteDocument, getOriginalBlob } from '../../services/api/documentService';
import { OriginalDocumentPreview } from '../../components/documents/OriginalDocumentPreview';

export const DocumentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'extracted' | 'qa' | 'rawJson' | 'text'>('extracted');
  const [error, setError] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchDoc = async () => {
      try {
        if (id) { const doc = await getDocument(id); if (!cancelled) setDocItem(doc); }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load document'); }
      finally { if (!cancelled) setLoading(false); }
    };
    setLoading(true); setError(''); setCurrentPage(1);
    void fetchDoc();
    const timer = setInterval(fetchDoc, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id]);

  const handleCopyJson = () => {
    if (docItem) {
      navigator.clipboard.writeText(JSON.stringify(docItem, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleDownloadOriginal = async () => {
    if (!docItem) return;
    try {
    const blob = await getOriginalBlob(docItem.id);
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = docItem.name;
    a.click();
    URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Download failed'); }
  };

  const handleReprocess = async () => {
    if (!docItem) return;
    try { const updated = await retryDocument(docItem.id); if (updated) setDocItem(updated); }
    catch (err) { setError(err instanceof Error ? err.message : 'Reprocessing failed'); }
  };

  const handleDelete = async () => {
    if (!docItem) return;
    try { await deleteDocument(docItem.id); navigate('/documents'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Deletion failed'); }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[#64748B] dark:text-[#94A3B8]">
        <RotateCw className="w-8 h-8 animate-spin mx-auto text-[#1E40AF] mb-3" />
        <p className="text-[14px]">Loading document details and inspection vectors...</p>
      </div>
    );
  }

  if (!docItem) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">Document Not Found</h2>
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-1">
          {error || 'The requested document could not be found.'}
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/documents')}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(error || docItem.failureReason) && <p role="alert" className="p-3 text-sm text-red-600 border border-red-200 rounded">{error || docItem.failureReason}</p>}
      {/* Top Header & Breadcrumbs */}
      <div className="space-y-3 pb-3 border-b border-[#E2E8F0] dark:border-[#334155]">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-2 text-[12px] text-[#64748B] dark:text-[#94A3B8]">
          <Link to="/documents" className="hover:text-[#1E40AF] flex items-center gap-1 font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Documents
          </Link>
          <span>/</span>
          <span>System</span>
          <span>/</span>
          <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">{docItem.id}</span>
        </div>

        {/* Title & Actions Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
                {docItem.name}
              </h1>
              <Badge variant={docItem.status === 'Completed' ? 'success' : 'info'}>
                {docItem.status}
              </Badge>
              <span className="px-2 py-0.5 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#93C5FD] font-mono text-[11px] font-medium border border-[#BFDBFE] dark:border-[#1E40AF]">
                {docItem.type}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#64748B] dark:text-[#94A3B8] font-mono">
              <span>Extraction: {docItem.pages?.some(page => page.extractionMethod === 'ocr') ? 'Local OCR + PDF text' : 'PDF text'}</span>
              <span>·</span>
              <span className="text-[#059669] dark:text-[#34D399] font-semibold">
                Confidence: {docItem.confidence}%
              </span>
              <span>·</span>
              <span>{docItem.fileSize}</span>
              <span>·</span>
              <span>{docItem.uploadDate}</span>
            </div>
          </div>

          {/* Action bar on top right */}
          <div className="flex items-center flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={handleDownloadOriginal}
            >
              Download Original
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Code className="w-3.5 h-3.5" />}
              onClick={handleCopyJson}
            >
              {copiedJson ? 'Copied JSON' : 'Export JSON'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCw className="w-3.5 h-3.5" />}
              onClick={handleReprocess}
              disabled={!['Failed', 'Completed'].includes(docItem.status)}
            >
              Reprocess
            </Button>
            <Button
              size="sm"
              variant="destructive"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Layout (2-Column Split: 55% Left Viewport, 45% Right Workspace) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols ~ 55%): Interactive Document Previewer */}
        <div className="lg:col-span-7 space-y-4">
          <Card noPadding>
            {/* Viewport Toolbar */}
            <div className="p-2.5 border-b border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#162032] flex flex-wrap items-center justify-between gap-2 text-[12px]">
              {/* Page Controls */}
              <div className="flex items-center gap-1.5 font-mono text-[#475569] dark:text-[#94A3B8]">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span>
                  Page {currentPage} of {docItem.pagesCount}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(docItem.pagesCount, p + 1))}
                  disabled={currentPage === docItem.pagesCount}
                  className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                  title="Zoom Out"
                  className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] hover:bg-white text-[#475569] dark:text-[#CBD5E1]"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-12 text-center text-[#475569] dark:text-[#CBD5E1]">
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                  title="Zoom In"
                  className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] hover:bg-white text-[#475569] dark:text-[#CBD5E1]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(100)}
                  className="px-2 py-0.5 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] text-[11px] hover:bg-white text-[#475569] dark:text-[#CBD5E1]"
                >
                  Fit
                </button>
              </div>

              <span className="text-[11px] text-[#64748B]">Original uploaded file</span>
            </div>

            {/* Document Canvas Preview */}
            <div className="p-6 bg-[#64748B10] flex items-center justify-center min-h-[580px] overflow-auto">
              <div
                className="w-[595px] min-h-[742px] bg-white text-[#0F172A] shadow-layer2 border border-[#CBD5E1] p-8 relative rounded-[2px] transition-transform select-none"
              >
                {/* Actual Document Content Preview */}
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                  <div className="absolute top-2 right-2 text-xs text-gray-500 z-10 px-2 py-1 bg-white/80 rounded">
                    {docItem.originalFileName || docItem.name}
                  </div>
                  <OriginalDocumentPreview id={docItem.id} name={docItem.name} mimeType={docItem.mimeType} page={currentPage} zoom={zoomLevel} />
                  {/* Fallback if image fails to load */}
                  <div className="hidden text-center text-gray-400 py-10 w-full">
                     Preview unavailable.<br/>Please download the original file.
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Document Storage & Checksum Metadata Card */}
          <Card
            title="Document Storage & Integrity"
            subtitle="Verified storage proof & immutable trace"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] font-mono">
              <div className="p-2.5 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A]">
                <span className="text-[11px] text-[#64748B] block mb-1">SHA-256 Checksum:</span>
                <span className="text-[11px] text-[#0F172A] dark:text-[#F8FAFC] break-all select-all">
                  {docItem.sha256}
                </span>
              </div>
              <div className="p-2.5 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A]">
                <span className="text-[11px] text-[#64748B] block mb-1">Storage location:</span>
                <span className="text-[11px] text-[#1E40AF] dark:text-[#60A5FA] break-all select-all">
                  {docItem.s3Uri}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column (5 cols ~ 45%): Tabbed Inspection & Q&A Workspace */}
        <div className="lg:col-span-5 space-y-4">
          <Card noPadding>
            {/* Tab navigation */}
            <div className="flex items-center border-b border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#162032]">
              <button
                onClick={() => setActiveTab('extracted')}
                className={`flex-1 py-3 text-[12px] font-medium border-b-2 transition-all ${
                  activeTab === 'extracted'
                    ? 'border-[#1E40AF] text-[#1E40AF] dark:text-[#60A5FA] bg-white dark:bg-[#1E293B] font-semibold'
                    : 'border-transparent text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                Extracted Fields
              </button>
              <button
                onClick={() => setActiveTab('qa')}
                className={`flex-1 py-3 text-[12px] font-medium border-b-2 transition-all ${
                  activeTab === 'qa'
                    ? 'border-[#1E40AF] text-[#1E40AF] dark:text-[#60A5FA] bg-white dark:bg-[#1E293B] font-semibold'
                    : 'border-transparent text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                Grounded Q&A
              </button>
              <button onClick={() => setActiveTab('text')} className={`flex-1 py-3 text-[12px] font-medium border-b-2 ${activeTab === 'text' ? 'border-[#1E40AF] text-[#1E40AF]' : 'border-transparent text-[#64748B]'}`}>
                Full Text
              </button>
              <button
                onClick={() => setActiveTab('rawJson')}
                className={`flex-1 py-3 text-[12px] font-medium border-b-2 transition-all ${
                  activeTab === 'rawJson'
                    ? 'border-[#1E40AF] text-[#1E40AF] dark:text-[#60A5FA] bg-white dark:bg-[#1E293B] font-semibold'
                    : 'border-transparent text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                Raw OCR JSON
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'text' && <div className="space-y-4 max-h-[650px] overflow-auto">
                {docItem.pages?.length ? docItem.pages.map(page => <section key={page.page}>
                  <h4 className="font-semibold text-sm mb-2">Page {page.page} · {page.extractionMethod === 'ocr' ? 'OCR' : 'PDF text'}</h4>
                  <pre className="whitespace-pre-wrap break-words text-xs font-mono">{page.text || '(Blank page)'}</pre>
                </section>) : <p className="text-sm text-[#64748B]">Reprocess this document to inspect its complete page text.</p>}
              </div>}
              {/* TAB 1: Extracted Fields & Line Items */}
              {activeTab === 'extracted' && (
                <div className="space-y-4">
                  {/* Validation status banner */}
                  <div className="p-3 rounded-[4px] bg-[#ECFDF5] dark:bg-[#064E3B20] border border-[#A7F3D0] dark:border-[#065F46] flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
                    <span className="text-[12px] text-[#065F46] dark:text-[#34D399] font-medium">
                      {docItem.extractedFields.length} extracted fields and {docItem.lineItems?.length || 0} line items. Review against the original document.
                    </span>
                  </div>

                  {/* Key-Values Grid */}
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2 font-mono">
                      Header Key-Values
                    </h4>
                    <div className="space-y-1.5">
                      {docItem.extractedFields.map((field, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] text-[12px]"
                        >
                          <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">
                            {field.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              {field.value}
                            </span>
                            {field.confidence && (
                              <span className="text-[10px] font-mono text-[#059669]">
                                {Math.round(field.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Line Items Table if available */}
                  {docItem.lineItems && docItem.lineItems.length > 0 && (
                    <div>
                      <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2 font-mono">
                        Extracted Line Items ({docItem.lineItems.length})
                      </h4>
                      <div className="overflow-x-auto border border-[#E2E8F0] dark:border-[#334155] rounded-[4px]">
                        <table className="w-full text-left text-[11px]">
                          <thead>
                            <tr className="bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155] text-[#64748B] dark:text-[#94A3B8] font-semibold">
                              <th className="p-2">Description</th>
                              <th className="p-2 text-right">Qty</th>
                              <th className="p-2 text-right">Price</th>
                              <th className="p-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9] dark:divide-[#2B3B52]">
                            {docItem.lineItems.map((li) => (
                              <tr key={li.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#243248]">
                                <td className="p-2">
                                  <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                                    {li.description}
                                  </div>
                                  <div className="text-[10px] text-[#64748B]">{li.serviceUsage}</div>
                                </td>
                                <td className="p-2 text-right font-mono">{li.quantity}</td>
                                <td className="p-2 text-right font-mono">{li.unitPrice}</td>
                                <td className="p-2 text-right font-mono font-bold text-[#1E40AF] dark:text-[#60A5FA]">
                                  {li.amount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Grounded Q&A Shortcut */}
              {activeTab === 'qa' && (
                <div className="space-y-4 text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-[#EFF6FF] dark:bg-[#1E3A8A30] text-[#1E40AF] dark:text-[#60A5FA] flex items-center justify-center mx-auto mb-2">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="text-[15px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    Grounded Document Intelligence
                  </h4>
                  <p className="text-[12px] text-[#64748B] dark:text-[#94A3B8] max-w-xs mx-auto">
                    Ask specific questions about dates, totals, line items, and terms. Every response includes verified citations back to this file.
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    icon={<ExternalLink className="w-3.5 h-3.5" />}
                    onClick={() => navigate(`/documents/${docItem.id}/qa`)}
                    className="mt-2"
                  >
                    Open Dedicated Q&A Workspace
                  </Button>
                </div>
              )}

              {/* TAB 3: Raw OCR JSON Schema */}
              {activeTab === 'rawJson' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#64748B]">application/json (UTF-8)</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={copiedJson ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <Copy className="w-3.5 h-3.5" />}
                      onClick={handleCopyJson}
                    >
                      {copiedJson ? 'Copied' : 'Copy JSON'}
                    </Button>
                  </div>
                  <pre className="p-3 rounded-[4px] bg-[#0F172A] text-[#E2E8F0] font-mono text-[11px] max-h-[460px] overflow-auto select-all">
                    {JSON.stringify(docItem, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
