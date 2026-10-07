import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  RotateCw, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Layers, 
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
import { getDocument, retryDocument, deleteDocument } from '../../services/api/documentService';

export const DocumentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'extracted' | 'qa' | 'rawJson'>('extracted');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    const fetchDoc = async () => {
      setLoading(true);
      if (id) {
        const doc = await getDocument(id);
        setDocItem(doc);
      }
      setLoading(false);
    };
    fetchDoc();
  }, [id]);

  const handleCopyJson = () => {
    if (docItem) {
      navigator.clipboard.writeText(JSON.stringify(docItem, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleDownloadOriginal = () => {
    if (!docItem) return;
    const blob = new Blob([`Simulated document content for ${docItem.name}`], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = docItem.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReprocess = async () => {
    if (!docItem) return;
    const updated = await retryDocument(docItem.id);
    if (updated) setDocItem(updated);
  };

  const handleDelete = async () => {
    if (!docItem) return;
    await deleteDocument(docItem.id);
    navigate('/documents');
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
          The requested document could not be located in S3 vault.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/documents')}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              <span>OCR Engine: AWS Textract + LayoutLMv3</span>
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
              Download Original (PDF)
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

              {/* Bounding Box Toggle */}
              <button
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors ${
                  showBoundingBoxes
                    ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF] dark:bg-[#1E3A8A40] dark:border-[#1E40AF] dark:text-[#93C5FD]'
                    : 'bg-white border-[#CBD5E1] text-[#64748B] dark:bg-[#1E293B] dark:border-[#475569]'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>OCR Bounding Boxes: {showBoundingBoxes ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Document Canvas Preview */}
            <div className="p-6 bg-[#64748B10] flex items-center justify-center min-h-[580px] overflow-auto">
              <div
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                className="w-[595px] min-h-[742px] bg-white text-[#0F172A] shadow-layer2 border border-[#CBD5E1] p-8 relative rounded-[2px] transition-transform select-none"
              >
                {/* Visual Invoice Watermark / Header */}
                <div className="flex justify-between items-start border-b-2 border-[#1E40AF] pb-4 mb-6">
                  <div>
                    <div className="text-[20px] font-extrabold text-[#1E40AF] tracking-tight">
                      amazon web services
                    </div>
                    <div className="text-[11px] text-[#475569] mt-0.5">
                      Amazon Web Services, Inc. · 410 Terry Ave N, Seattle, WA 98109
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[18px] font-bold tracking-tight text-[#0F172A]">
                      TAX INVOICE
                    </span>
                    <div className="text-[11px] font-mono text-[#64748B]">
                      INV-88492-US
                    </div>
                  </div>
                </div>

                {/* Key-Value Details */}
                <div className="grid grid-cols-2 gap-6 text-[12px] mb-6">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-[#64748B]">Billed To:</div>
                    <div className="font-semibold text-[#0F172A]">CloudTech Solutions Ltd.</div>
                    <div className="text-[#475569]">Attn: Alex Parker (Cloud Systems)</div>
                    <div className="text-[#475569]">Account ID: 1092-4820-9921</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-[10px] uppercase font-bold text-[#64748B]">Billing Summary:</div>
                    <div>Invoice Date: <span className="font-medium">Oct 24, 2026</span></div>
                    <div>Billing Period: <span className="font-medium">Oct 1 - Oct 31, 2026</span></div>
                    <div>Due Date: <span className="font-bold text-[#1E40AF]">Nov 23, 2026</span></div>
                  </div>
                </div>

                {/* Document Items Table Canvas */}
                <table className="w-full text-left text-[11px] mb-6 border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#CBD5E1] text-[#475569] font-bold">
                      <th className="py-2 px-1">Service / Description</th>
                      <th className="py-2 px-1 text-right">Usage</th>
                      <th className="py-2 px-1 text-right">Rate</th>
                      <th className="py-2 px-1 text-right">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    <tr>
                      <td className="py-2 px-1 font-medium">Amazon EC2 (c6i.4xlarge compute)</td>
                      <td className="py-2 px-1 text-right font-mono">744 Hrs</td>
                      <td className="py-2 px-1 text-right font-mono">$4.25</td>
                      <td className="py-2 px-1 text-right font-mono font-semibold">$3,162.00</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-1 font-medium">Amazon RDS PostgreSQL Multi-AZ</td>
                      <td className="py-2 px-1 text-right font-mono">744 Hrs</td>
                      <td className="py-2 px-1 text-right font-mono">$2.80</td>
                      <td className="py-2 px-1 text-right font-mono font-semibold">$2,083.20</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-1 font-medium">Amazon S3 Standard Storage & Ingest</td>
                      <td className="py-2 px-1 text-right font-mono">48.2 TB</td>
                      <td className="py-2 px-1 text-right font-mono">$0.023</td>
                      <td className="py-2 px-1 text-right font-mono font-semibold">$1,108.60</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-1 font-medium">AWS Lambda Ingestion Workers</td>
                      <td className="py-2 px-1 text-right font-mono">14.2M req</td>
                      <td className="py-2 px-1 text-right font-mono">$0.000016</td>
                      <td className="py-2 px-1 text-right font-mono font-semibold">$227.20</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-1 font-medium font-semibold text-[#1E40AF]">
                        Amazon Textract Document Layout API
                      </td>
                      <td className="py-2 px-1 text-right font-mono">128,400 pgs</td>
                      <td className="py-2 px-1 text-right font-mono">$0.05</td>
                      <td className="py-2 px-1 text-right font-mono font-bold text-[#1E40AF]">$6,420.00</td>
                    </tr>
                  </tbody>
                </table>

                {/* Total Block */}
                <div className="border-t-2 border-[#0F172A] pt-3 flex justify-end">
                  <div className="w-56 space-y-1.5 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Subtotal:</span>
                      <span className="font-mono">$11,684.85</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B]">Tax (VAT/GST 9.8%):</span>
                      <span className="font-mono">$1,155.65</span>
                    </div>
                    <div className="flex justify-between text-[14px] font-bold text-[#1E40AF] border-t border-[#CBD5E1] pt-1">
                      <span>Total Amount:</span>
                      <span className="font-mono">$12,840.50</span>
                    </div>
                  </div>
                </div>

                {/* OCR Bounding Boxes Highlight Overlay */}
                {showBoundingBoxes && (
                  <>
                    <div
                      className="absolute top-[28px] right-[28px] border-2 border-[#1E40AF] bg-[#1E40AF15] rounded-[2px] pointer-events-none"
                      style={{ width: '150px', height: '42px' }}
                    >
                      <span className="absolute -top-4 right-0 text-[9px] bg-[#1E40AF] text-white px-1 font-mono rounded-[2px]">
                        INV_ID (99.8%)
                      </span>
                    </div>

                    <div
                      className="absolute top-[28px] left-[28px] border-2 border-[#059669] bg-[#05966915] rounded-[2px] pointer-events-none"
                      style={{ width: '220px', height: '40px' }}
                    >
                      <span className="absolute -top-4 left-0 text-[9px] bg-[#059669] text-white px-1 font-mono rounded-[2px]">
                        VENDOR (99.9%)
                      </span>
                    </div>

                    <div
                      className="absolute top-[345px] left-[28px] border-2 border-[#0284C7] bg-[#0284C715] rounded-[2px] pointer-events-none"
                      style={{ width: '539px', height: '32px' }}
                    >
                      <span className="absolute -top-4 left-0 text-[9px] bg-[#0284C7] text-white px-1 font-mono rounded-[2px]">
                        PRIMARY_LINE_ITEM (99.7%)
                      </span>
                    </div>

                    <div
                      className="absolute top-[430px] right-[28px] border-2 border-[#E11D48] bg-[#E11D4815] rounded-[2px] pointer-events-none"
                      style={{ width: '235px', height: '80px' }}
                    >
                      <span className="absolute -top-4 right-0 text-[9px] bg-[#E11D48] text-white px-1 font-mono rounded-[2px]">
                        TOTAL_DUE (99.9%)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Document Storage & Checksum Metadata Card */}
          <Card
            title="S3 Cloud Vault & Cryptographic Integrity"
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
                <span className="text-[11px] text-[#64748B] block mb-1">AWS S3 Destination:</span>
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
              {/* TAB 1: Extracted Fields & Line Items */}
              {activeTab === 'extracted' && (
                <div className="space-y-4">
                  {/* Validation status banner */}
                  <div className="p-3 rounded-[4px] bg-[#ECFDF5] dark:bg-[#064E3B20] border border-[#A7F3D0] dark:border-[#065F46] flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
                    <span className="text-[12px] text-[#065F46] dark:text-[#34D399] font-medium">
                      All 5 line items reconciled against subtotal. Mathematical integrity verified (100% confidence).
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
                                {field.confidence}%
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
