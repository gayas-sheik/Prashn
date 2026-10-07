import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Download, 
  Trash2, 
  RotateCw, 
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DocumentTable } from '../../components/documents/DocumentTable';
import { DocumentPreviewDrawer } from '../../components/documents/DocumentPreviewDrawer';
import type { DocumentItem } from '../../types';
import { getDocuments, deleteDocument, retryDocument } from '../../services/api/documentService';

export const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'Processing' | 'Failed' | 'Queued'>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadDocs = async () => {
    setLoading(true);
    const data = await getDocuments();
    setDocuments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredDocuments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocuments.map((d) => d.id));
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteDocument(id);
    }
    setDocuments((prev) => prev.filter((d) => !selectedIds.includes(d.id)));
    setSelectedIds([]);
  };

  const handleRetry = async (id: string) => {
    const updated = await retryDocument(id);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
    }
  };

  const handleBulkRetry = async () => {
    for (const id of selectedIds) {
      await retryDocument(id);
    }
    loadDocs();
    setSelectedIds([]);
  };

  const handleExportSelection = () => {
    const targetDocs = selectedIds.length > 0 
      ? documents.filter(d => selectedIds.includes(d.id))
      : documents;
    
    const jsonStr = JSON.stringify(targetDocs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `prashn_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtering
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.extractedSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.uploader.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ? true : doc.status === statusFilter;

    const matchesType =
      typeFilter === 'All' ? true : doc.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalPages = Math.ceil(filteredDocuments.length / pageSize) || 1;
  const paginatedDocs = filteredDocuments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const statusTabs = [
    { label: 'All (128)', value: 'All' as const },
    { label: 'Completed (114)', value: 'Completed' as const },
    { label: 'Processing (6)', value: 'Processing' as const },
    { label: 'Failed (8)', value: 'Failed' as const },
    { label: 'Queued (0)', value: 'Queued' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Documents
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Manage, search, and review your processed cloud document repository.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportSelection}
          >
            Export Selection
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => navigate('/upload')}
          >
            + Upload Documents
          </Button>
        </div>
      </div>

      {/* Filter & Control Bar Card */}
      <Card noPadding>
        {/* Status Filter Tabs */}
        <div className="px-4 border-b border-[#E2E8F0] dark:border-[#334155] flex items-center gap-4 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setCurrentPage(1);
              }}
              className={`py-3 text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                statusFilter === tab.value
                  ? 'border-[#1E40AF] text-[#1E40AF] dark:text-[#60A5FA] font-semibold'
                  : 'border-transparent text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls row */}
        <div className="p-3 bg-[#F8FAFC] dark:bg-[#162032] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-[#334155]">
          {/* Left: Search input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by file name, vendor, invoice #, or text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-[36px] pl-9 pr-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
            />
          </div>

          {/* Right: Dropdown filters */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Type Filter */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] px-2.5 h-[36px]">
              <Filter className="w-3.5 h-3.5 text-[#64748B]" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-transparent text-[12px] font-medium text-[#334155] dark:text-[#E2E8F0] focus:outline-none cursor-pointer"
              >
                <option value="All">All Types</option>
                <option value="Invoice">Invoices</option>
                <option value="Receipt">Receipts</option>
                <option value="Form">Forms</option>
                <option value="Contract">Contracts</option>
              </select>
            </div>

            {/* Date Range Picker Dropdown */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] px-2.5 h-[36px]">
              <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent text-[12px] font-medium text-[#334155] dark:text-[#E2E8F0] focus:outline-none cursor-pointer"
              >
                <option value="Last 24 Hours">Last 24 Hours</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="This Quarter">This Quarter</option>
                <option value="Year 2026">Year 2026</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedIds.length > 0 && (
          <div className="px-4 py-2.5 bg-[#EFF6FF] dark:bg-[#1E3A8A30] border-b border-[#BFDBFE] dark:border-[#1E40AF] flex items-center justify-between transition-all">
            <span className="text-[13px] font-semibold text-[#1E40AF] dark:text-[#93C5FD] flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              {selectedIds.length} {selectedIds.length === 1 ? 'item' : 'items'} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={handleExportSelection}
              >
                Download JSON
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCw className="w-3.5 h-3.5" />}
                onClick={handleBulkRetry}
              >
                Reprocess
              </Button>
              <Button
                size="sm"
                variant="destructive"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={handleBulkDelete}
              >
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Loading state or Data Table */}
        {loading ? (
          <div className="p-12 text-center text-[#64748B] dark:text-[#94A3B8] space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#1E40AF]" />
            <p className="text-[13px]">Loading documents...</p>
          </div>
        ) : (
          <DocumentTable
            documents={paginatedDocs}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onPreview={(doc) => setPreviewDoc(doc)}
            onDelete={handleDelete}
            onRetry={handleRetry}
          />
        )}

        {/* Bottom Table Footer & Pagination */}
        <div className="px-4 py-3 border-t border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[#64748B] dark:text-[#94A3B8]">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-[#0F172A] dark:text-[#F8FAFC]">1-{paginatedDocs.length}</strong> of{' '}
              <strong className="text-[#0F172A] dark:text-[#F8FAFC]">{filteredDocuments.length}</strong> documents
            </span>
            <div className="flex items-center gap-1.5">
              <span>Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-[#F8FAFC] dark:bg-[#162032] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] px-1.5 py-0.5 text-[#0F172A] dark:text-[#F8FAFC] text-[11px]"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] text-[#64748B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-2.5 py-0.5 rounded-[4px] bg-[#1E40AF] text-white font-medium text-[12px]">
              {currentPage}
            </button>
            {totalPages > 1 && (
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-0.5 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] text-[#334155] dark:text-[#E2E8F0] font-medium text-[12px]"
              >
                {Math.min(totalPages, currentPage + 1)}
              </button>
            )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-[4px] border border-[#CBD5E1] dark:border-[#475569] text-[#64748B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Slide-over Preview Drawer */}
      <DocumentPreviewDrawer
        document={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDelete={handleDelete}
        onRetry={handleRetry}
      />
    </div>
  );
};
