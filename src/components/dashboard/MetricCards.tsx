import React from 'react';
import { Files, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/Badge';

export const MetricCards: React.FC = () => {
  const metrics = [
    {
      title: 'Total Documents',
      value: '128',
      change: '+14% this month',
      badge: '+12 today',
      badgeVariant: 'primary' as const,
      icon: Files,
      accentColor: 'text-[#1E40AF] dark:text-[#60A5FA]',
      subtext: 'Ingested across active buckets',
    },
    {
      title: 'Processing',
      value: '6',
      change: 'Avg. 3.2s latency',
      badge: 'Active in SQS/Textract',
      badgeVariant: 'info' as const,
      icon: Cpu,
      pulse: true,
      accentColor: 'text-[#0284C7] dark:text-[#38BDF8]',
      subtext: '4 Textract · 2 SQS In-flight',
    },
    {
      title: 'Completed',
      value: '114',
      change: '94.2% success rate',
      badge: 'Extracted & Indexed',
      badgeVariant: 'success' as const,
      icon: CheckCircle2,
      accentColor: 'text-[#059669] dark:text-[#34D399]',
      subtext: '100% schema validation verified',
    },
    {
      title: 'Failed',
      value: '8',
      change: 'Needs review',
      badge: '2 exceptions flagged',
      badgeVariant: 'error' as const,
      icon: AlertTriangle,
      accentColor: 'text-[#E11D48] dark:text-[#F87171]',
      subtext: 'Low DPI / Corrupted scan DLQ',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.title}
            className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4 flex flex-col justify-between hover:border-[#CBD5E1] dark:hover:border-[#475569] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                {m.title}
              </span>
              <div className={`p-1.5 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#334155] ${m.accentColor}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[28px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
                {m.value}
              </span>
              <Badge variant={m.badgeVariant} pulse={m.pulse}>
                {m.badge}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-2 border-t border-[#F1F5F9] dark:border-[#2B3B52] mt-2">
              <span className="flex items-center gap-0.5 text-[#059669] dark:text-[#34D399] font-medium">
                {m.change}
              </span>
              <span className="truncate ml-2">{m.subtext}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
