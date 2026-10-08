import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, MessageSquare, Trash2, AlertTriangle, FileText } from 'lucide-react';
import type { DocumentItem } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface DocumentPreviewDrawerProps {
  document: DocumentItem | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const DocumentPreviewDrawer: React.FC<DocumentPreviewDrawerProps> = ({
  document,
  onClose,
  onDelete,
  onRetry,
}) => {
  const navigate = useNavigate();

  if (!document) return null;

  const getBadgeVariant = (status: DocumentItem['status']) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Processing': return 'info';
      case 'Failed': return 'error';
      case 'Queued': return 'warning';
      default: return 'neutral';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0F172A] bg-opacity-40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-[#1E293B] border-l border-[#E2E8F0] dark:border-[#334155] shadow-layer3 flex flex-col justify-between">
          {/* Header */}
          <div>
            <div className="flex items-center justify-between h-[56px] px-4 border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA] flex-shrink-0" />
                <span className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  {document.name || document.originalFileName}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-[4px] text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="p-4 border-b border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#162032] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(document.status)} pulse={document.status === 'Processing'}>
                  {document.status}
                </Badge>
                <span className="text-[12px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  {document.type} · {document.pagesCount} {document.pagesCount === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
              <span className="text-[11px] font-mono font-medium text-[#059669]">
                {document.confidence > 0 ? `${document.confidence}% Confidence` : ''}
              </span>
            </div>

            {/* Content Details */}
            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
              {/* Failure Alert if Failed */}
              {document.status === 'Failed' && document.failureReason && (
                <div className="p-3 rounded-[4px] bg-[#FFF1F2] dark:bg-[#88133740] border border-[#FECDD3] dark:border-[#9F1239] text-[12px]">
                  <div className="flex items-center gap-1.5 font-semibold text-[#9F1239] dark:text-[#F87171] mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    Processing Exception
                  </div>
                  <p className="text-[#881337] dark:text-[#FECDD3]">
                    {document.failureReason}
                  </p>
                  {onRetry && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRetry(document.id)}
                      className="mt-2"
                    >
                      Retry Processing
                    </Button>
                  )}
                </div>
              )}

              {/* Document Overview Metadata */}
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2 font-mono">
                  Storage & Pipeline Metadata
                </h4>
                <div className="space-y-1.5 text-[12px] bg-[#F8FAFC] dark:bg-[#162032] p-2.5 rounded-[4px] border border-[#E2E8F0] dark:border-[#2D3F5A]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Document ID:</span>
                    <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">{document.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">File Size:</span>
                    <span className="font-mono">{document.fileSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Processing Duration:</span>
                    <span className="font-mono">{document.processingDuration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Uploaded By:</span>
                    <span>{document.uploaderName || document.uploader || 'System'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Timestamp:</span>
                    <span className="font-mono text-[11px]">{document.uploadDate}</span>
                  </div>
                  <div className="pt-1.5 border-t border-[#E2E8F0] dark:border-[#2D3F5A]">
                    <span className="text-[10px] text-[#64748B] block mb-0.5">Storage location:</span>
                    <span className="font-mono text-[10px] text-[#1E40AF] dark:text-[#60A5FA] break-all select-all">
                      {document.s3Uri}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extracted Key-Values */}
              {document.extractedFields && document.extractedFields.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2 font-mono">
                    Extracted Fields ({document.extractedFields.length})
                  </h4>
                  <div className="space-y-1.5">
                    {document.extractedFields.map((field, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-[12px]"
                      >
                        <span className="text-[#64748B] dark:text-[#94A3B8] font-medium">
                          {field.label}
                        </span>
                        <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC] text-right">
                          {field.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-3 border-t border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="primary"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => {
                  onClose();
                  navigate(`/documents/${document.id}`);
                }}
              >
                Inspect Full Details
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                onClick={() => {
                  onClose();
                  navigate(`/documents/${document.id}/qa`);
                }}
              >
                Q&A Chat
              </Button>
            </div>

            {onDelete && (
              <Button
                size="sm"
                variant="tertiary"
                className="text-[#E11D48] hover:bg-[#FFF1F2]"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => {
                  onDelete(document.id);
                  onClose();
                }}
                title="Delete document"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
