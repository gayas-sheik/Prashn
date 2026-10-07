import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  ArrowRight, 
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { MetricCards } from '../../components/dashboard/MetricCards';
import { LiveActivityFeed } from '../../components/dashboard/LiveActivityFeed';
import { PipelineHealthCard } from '../../components/dashboard/PipelineHealthCard';
import { DocumentTable } from '../../components/documents/DocumentTable';
import { DocumentPreviewDrawer } from '../../components/documents/DocumentPreviewDrawer';
import type { DocumentItem } from '../../types';
import { getDocuments, deleteDocument, retryDocument } from '../../services/api/documentService';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'All' | 'Invoice' | 'Receipt' | 'Form'>('All');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  const loadDocs = async () => {
    setLoading(true);
    const data = await getDocuments();
    setDocuments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleRetry = async (id: string) => {
    const updated = await retryDocument(id);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.extractedSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedTypeFilter === 'All' || doc.type === selectedTypeFilter;
    return matchesSearch && matchesType;
  });

  const recentDocs = filteredDocuments.slice(0, 5);

  const filterTabs = [
    { label: 'All (128)', value: 'All' as const },
    { label: 'Invoices (58)', value: 'Invoice' as const },
    { label: 'Receipts (42)', value: 'Receipt' as const },
    { label: 'Forms (28)', value: 'Form' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Dashboard
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Overview of your document processing activity across AWS cloud pipelines.
          </p>
        </div>

        {/* Top-Right CTA Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
            onClick={() => {
              const csvContent = "data:text/csv;charset=utf-8," + 
                "ID,Name,Type,Status,UploadDate,Summary\n" + 
                documents.map(e => `"${e.id}","${e.name}","${e.type}","${e.status}","${e.uploadDate}","${e.extractedSummary}"`).join("\n");
              const encodedUri = encodeURI(csvContent);
              const link = window.document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", "prashn_report_oct_2026.csv");
              window.document.body.appendChild(link);
              link.click();
              window.document.body.removeChild(link);
            }}
          >
            Export Report
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate('/upload')}
          >
            Upload Document
          </Button>
        </div>
      </div>

      {/* Row 1: 4 Metric Cards */}
      <MetricCards />

      {/* Row 2: 2-Column Main Content (8 cols left, 4 cols right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Recent Documents */}
        <div className="lg:col-span-8 space-y-4">
          <Card
            title={
              <div className="flex items-center justify-between w-full">
                <span className="text-[15px] font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  Recent Documents
                </span>
                <Link
                  to="/documents"
                  className="text-[12px] text-[#1E40AF] dark:text-[#60A5FA] hover:underline font-medium flex items-center gap-1"
                >
                  View all documents <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            }
            noPadding
          >
            {/* Search & Filter Pills */}
            <div className="p-3 border-b border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#162032] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setSelectedTypeFilter(tab.value)}
                    className={`px-2.5 py-1 text-[12px] font-medium rounded-[4px] transition-colors whitespace-nowrap ${
                      selectedTypeFilter === tab.value
                        ? 'bg-[#1E40AF] text-white'
                        : 'bg-white dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8] border border-[#CBD5E1] dark:border-[#475569] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search recent documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-[32px] pl-8 pr-3 text-[12px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="p-12 text-center text-[#64748B] dark:text-[#94A3B8] space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#1E40AF]" />
                <p className="text-[13px]">Loading pipeline documents...</p>
              </div>
            ) : (
              <DocumentTable
                documents={recentDocs}
                showCheckbox={false}
                onPreview={(doc) => setPreviewDoc(doc)}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            )}
          </Card>
        </div>

        {/* Right Column (4 cols): Live Feed & Quota */}
        <div className="lg:col-span-4 space-y-6">
          <LiveActivityFeed />
          <PipelineHealthCard />
        </div>
      </div>

      {/* Slide-over Inspection Drawer */}
      <DocumentPreviewDrawer
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDelete={handleDelete}
        onRetry={handleRetry}
      />
    </div>
  );
};
