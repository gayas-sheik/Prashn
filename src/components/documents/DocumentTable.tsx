import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Image, 
  Eye, 
  MessageSquare, 
  RotateCw, 
  Trash2
} from 'lucide-react';
import type { DocumentItem } from '../../types';
import { Badge } from '../ui/Badge';

interface DocumentTableProps {
  documents: DocumentItem[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onPreview: (doc: DocumentItem) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
  showCheckbox?: boolean;
}

export const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onPreview,
  onDelete,
  onRetry,
  showCheckbox = true,
}) => {
  const navigate = useNavigate();

  const getBadgeVariant = (status: DocumentItem['status']) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Processing': return 'info';
      case 'Failed': return 'error';
      case 'Queued': return 'warning';
      default: return 'neutral';
    }
  };

  const isAllSelected = documents.length > 0 && selectedIds.length === documents.length;

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse">
        {/* Table Header */}
        <thead>
          <tr className="h-[36px] bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155] text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
            {showCheckbox && (
              <th className="w-10 px-3 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onSelectAll}
                  className="rounded-[2px] border-[#CBD5E1] text-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                />
              </th>
            )}
            <th className="px-3">Document Name</th>
            <th className="px-3">Classification</th>
            <th className="px-3">Status</th>
            <th className="px-3">Uploaded</th>
            <th className="px-3">Latency</th>
            <th className="px-3">Extracted Summary</th>
            <th className="px-3 text-right">Actions</th>
          </tr>
        </thead>

        {/* Table Body */}
        <tbody className="divide-y divide-[#F1F5F9] dark:divide-[#2B3B52] text-[13px]">
          {documents.length === 0 ? (
            <tr>
              <td colSpan={showCheckbox ? 8 : 7} className="text-center py-12 text-[#64748B] dark:text-[#94A3B8]">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-[14px]">No documents match the current criteria.</p>
                <p className="text-[12px] mt-1">Upload a new document or adjust your filters.</p>
              </td>
            </tr>
          ) : (
            documents.map((doc) => {
              const isSelected = selectedIds.includes(doc.id);
              const isPdf = doc.name.toLowerCase().endsWith('.pdf');

              return (
                <tr
                  key={doc.id}
                  className={`h-[48px] hover:bg-[#F8FAFC] dark:hover:bg-[#243248] transition-colors ${
                    isSelected ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A20]' : ''
                  }`}
                >
                  {showCheckbox && (
                    <td className="px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect?.(doc.id)}
                        className="rounded-[2px] border-[#CBD5E1] text-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                      />
                    </td>
                  )}

                  {/* Document Name */}
                  <td className="px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-[4px] bg-[#F1F5F9] dark:bg-[#334155] text-[#1E40AF] dark:text-[#60A5FA] flex-shrink-0">
                        {isPdf ? <FileText className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                      </div>
                      <div className="truncate max-w-[220px] sm:max-w-[320px]">
                        <button
                          onClick={() => navigate(`/documents/${doc.id}`)}
                          className="font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:text-[#1E40AF] dark:hover:text-[#60A5FA] hover:underline truncate block text-left"
                          title={doc.name}
                        >
                          {doc.name}
                        </button>
                        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                          {doc.fileSize} · {doc.id}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Classification */}
                  <td className="px-3">
                    <span className="inline-flex px-2 py-0.5 rounded-[2px] bg-[#F1F5F9] dark:bg-[#334155] text-[#334155] dark:text-[#E2E8F0] font-mono text-[11px] font-medium">
                      {doc.type}
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-3">
                    <Badge variant={getBadgeVariant(doc.status)} pulse={doc.status === 'Processing'}>
                      {doc.status}
                    </Badge>
                  </td>

                  {/* Upload Date & Uploader */}
                  <td className="px-3">
                    <div className="font-mono text-[11px] text-[#0F172A] dark:text-[#F8FAFC]">
                      {doc.uploadDate}
                    </div>
                    <div className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                      {doc.uploader}
                    </div>
                  </td>

                  {/* Processing Duration */}
                  <td className="px-3">
                    <span className="font-mono text-[12px] text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                      {doc.processingDuration}
                    </span>
                  </td>

                  {/* Extracted Summary */}
                  <td className="px-3">
                    <span className="font-medium text-[#334155] dark:text-[#CBD5E1] truncate block max-w-[200px]" title={doc.extractedSummary}>
                      {doc.extractedSummary}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Quick Peek Eye */}
                      <button
                        onClick={() => onPreview(doc)}
                        title="Quick preview drawer"
                        className="p-1.5 rounded-[4px] text-[#64748B] hover:text-[#1E40AF] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#334155] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* Q&A chat */}
                      <button
                        onClick={() => navigate(`/documents/${doc.id}/qa`)}
                        title="Grounded document Q&A"
                        className="p-1.5 rounded-[4px] text-[#64748B] hover:text-[#1E40AF] dark:hover:text-[#60A5FA] hover:bg-[#EFF6FF] dark:hover:bg-[#334155] transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      {/* Retry if failed */}
                      {doc.status === 'Failed' && onRetry && (
                        <button
                          onClick={() => onRetry(doc.id)}
                          title="Retry processing"
                          className="p-1.5 rounded-[4px] text-[#D97706] hover:bg-[#FFFBEB] dark:hover:bg-[#78350F40] transition-colors"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(doc.id)}
                          title="Delete document"
                          className="p-1.5 rounded-[4px] text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] dark:hover:bg-[#88133740] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
