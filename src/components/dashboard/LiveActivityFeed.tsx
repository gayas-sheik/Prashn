import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card';

export const LiveActivityFeed: React.FC = () => {
  const activities = [
    {
      id: 'act-1',
      title: 'invoice_oct_01.pdf: OCR extraction completed (1.8s)',
      time: '4 mins ago',
      type: 'success',
      icon: CheckCircle2,
      color: 'text-[#059669]',
    },
    {
      id: 'act-2',
      title: 'receipt_store_08.jpg: OCR queued in SQS batch',
      time: '8 mins ago',
      type: 'info',
      icon: Clock,
      color: 'text-[#0284C7]',
    },
    {
      id: 'act-3',
      title: 'Schema validation: 100% matched enterprise schema',
      time: '25 mins ago',
      type: 'success',
      icon: CheckCircle2,
      color: 'text-[#059669]',
    },
    {
      id: 'act-4',
      title: 'application_form_claim.pdf: Classification failed (low DPI)',
      time: '1 hr ago',
      type: 'error',
      icon: AlertTriangle,
      color: 'text-[#E11D48]',
    },
  ];

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
          <span>Live Cloud Activity</span>
        </div>
      }
      subtitle="AWS Lambda & Textract real-time feed"
      headerAction={
        <Link
          to="/activity"
          className="text-[11px] text-[#1E40AF] dark:text-[#60A5FA] hover:underline font-medium flex items-center gap-1"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      }
    >
      <div className="space-y-3">
        {activities.map((a) => {
          const Icon = a.icon;
          return (
            <div
              key={a.id}
              className="flex items-start gap-2.5 p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A]"
            >
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${a.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                  {a.title}
                </p>
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                  {a.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
