import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Cpu, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { DocumentItem } from '../../types';
import { getDocuments, retryDocument } from '../../services/api/documentService';

export const ProcessingPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const docs = await getDocuments();
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRetry = async (id: string) => {
    const updated = await retryDocument(id);
    if (updated) {
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
    }
  };

  const pipelineStages = [
    'Uploaded',
    'Queued in SQS',
    'Worker Processing',
    'Classifying (LayoutLMv3)',
    'Extracting Information (Textract)',
    'Indexed & Ready'
  ];

  const getStageIndex = (status: DocumentItem['status']) => {
    switch (status) {
      case 'Uploaded': return 0;
      case 'Queued': return 1;
      case 'Processing': return 2;
      case 'Classifying': return 3;
      case 'Extracting information': return 4;
      case 'Completed': return 5;
      case 'Failed': return 2;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Processing Pipeline & Queue
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Real-time telemetry and stage-by-stage execution across AWS Textract, SQS, and Lambda workers.
          </p>
        </div>

        <Button
          variant="secondary"
          size="md"
          icon={<RotateCw className="w-3.5 h-3.5" />}
          onClick={loadData}
        >
          Refresh Pipeline
        </Button>
      </div>

      {/* Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            SQS Queue Depth
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[24px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              4 in-flight
            </span>
            <span className="text-[11px] text-[#059669] font-mono">0 delayed</span>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">prashn-high-prio & standard</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            Worker Concurrency
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[24px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              12 / 30 Lambda
            </span>
            <span className="text-[11px] text-[#0284C7] font-mono">40% capacity</span>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">Automatic scaling enabled</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            Avg Extraction Latency
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[24px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              1.84s
            </span>
            <span className="text-[11px] text-[#64748B] font-mono">p99: 3.2s</span>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">Textract OCR + Schema match</div>
        </div>
      </div>

      {/* Pipeline Stage Tracker for Individual Documents */}
      <div className="space-y-4">
        <h2 className="text-[16px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
          Active & Recent Pipeline Jobs
        </h2>

        {loading ? (
          <div className="p-12 text-center text-[#64748B] dark:text-[#94A3B8] space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#1E40AF]" />
            <p className="text-[13px]">Loading pipeline jobs...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const currentStage = getStageIndex(doc.status);
              const isFailed = doc.status === 'Failed';
              const isCompleted = doc.status === 'Completed';

              return (
                <Card key={doc.id} noPadding className="hover:border-[#CBD5E1] transition-all">
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#F1F5F9] dark:border-[#2B3B52]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A30] text-[#1E40AF] dark:text-[#60A5FA]">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[14px] text-[#0F172A] dark:text-[#F8FAFC]">
                            {doc.name}
                          </span>
                          <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            ({doc.id})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono mt-0.5">
                          <span>{doc.type}</span>
                          <span>·</span>
                          <span>{doc.fileSize}</span>
                          <span>·</span>
                          <span>{doc.uploadDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCompleted && (
                        <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>
                          Completed ({doc.processingDuration})
                        </Badge>
                      )}
                      {doc.status === 'Processing' && (
                        <Badge variant="info" pulse icon={<Cpu className="w-3 h-3" />}>
                          Processing Live
                        </Badge>
                      )}
                      {doc.status === 'Queued' && (
                        <Badge variant="warning" icon={<Clock className="w-3 h-3" />}>
                          Queued in SQS
                        </Badge>
                      )}
                      {isFailed && (
                        <Badge variant="error" icon={<AlertTriangle className="w-3 h-3" />}>
                          Failed (DLQ)
                        </Badge>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                      >
                        Inspect
                      </Button>

                      {isFailed && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<RotateCw className="w-3.5 h-3.5" />}
                          onClick={() => handleRetry(doc.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Pipeline Step Progress Bar */}
                  <div className="p-4 bg-[#F8FAFC] dark:bg-[#162032]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {pipelineStages.map((stageName, idx) => {
                        const isPast = currentStage > idx || isCompleted;
                        const isCurrent = currentStage === idx && !isCompleted && !isFailed;
                        const isStageFailed = isFailed && idx === 2;

                        let stepColor = 'border-[#CBD5E1] dark:border-[#475569] bg-white dark:bg-[#1E293B] text-[#64748B]';
                        if (isPast) {
                          stepColor = 'border-[#A7F3D0] dark:border-[#065F46] bg-[#ECFDF5] dark:bg-[#064E3B40] text-[#065F46] dark:text-[#34D399] font-medium';
                        } else if (isCurrent) {
                          stepColor = 'border-[#BFDBFE] dark:border-[#1E40AF] bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA] font-semibold animate-pulse';
                        } else if (isStageFailed) {
                          stepColor = 'border-[#FECDD3] dark:border-[#9F1239] bg-[#FFF1F2] dark:bg-[#88133740] text-[#9F1239] dark:text-[#F87171] font-semibold';
                        }

                        return (
                          <div
                            key={stageName}
                            className={`p-2 rounded-[4px] border text-[11px] flex flex-col justify-between ${stepColor}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-[10px] opacity-75">Stage {idx + 1}</span>
                              {isPast && <CheckCircle2 className="w-3 h-3 text-[#059669]" />}
                              {isCurrent && <Cpu className="w-3 h-3 text-[#1E40AF]" />}
                              {isStageFailed && <AlertTriangle className="w-3 h-3 text-[#E11D48]" />}
                            </div>
                            <span className="leading-snug">{stageName}</span>
                          </div>
                        );
                      })}
                    </div>

                    {isFailed && doc.failureReason && (
                      <div className="mt-3 p-2.5 rounded-[4px] bg-[#FFF1F2] dark:bg-[#88133740] border border-[#FECDD3] dark:border-[#9F1239] text-[12px] text-[#9F1239] dark:text-[#FECDD3]">
                        <strong>Failure Reason:</strong> {doc.failureReason}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
