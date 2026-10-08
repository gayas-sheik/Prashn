import React from 'react';
import { Files, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/Badge';

import type { DocumentItem } from '../../types';

interface MetricCardsProps {
  documents: DocumentItem[];
}

export const MetricCards: React.FC<MetricCardsProps> = ({ documents }) => {
  const total = documents.length;
  const processing = documents.filter(d => ['Queued', 'Processing', 'Classifying', 'Extracting'].includes(d.status)).length;
  const completed = documents.filter(d => d.status.startsWith('Completed')).length;
  const failed = documents.filter(d => d.status === 'Failed').length;

  const metrics = [
    {
      title: 'Total Documents',
      value: total.toString(),
      change: 'Lifetime uploads',
      badge: `${total} active`,
      badgeVariant: 'primary' as const,
      icon: Files,
      accentColor: 'text-[#1E40AF] dark:text-[#60A5FA]',
      subtext: 'Ingested across local system',
    },
    {
      title: 'Processing',
      value: processing.toString(),
      change: 'In processing queue',
      badge: 'Active pipeline',
      badgeVariant: 'info' as const,
      icon: Cpu,
      pulse: processing > 0,
      accentColor: 'text-[#0284C7] dark:text-[#38BDF8]',
      subtext: 'Local execution',
    },
    {
      title: 'Completed',
      value: completed.toString(),
      change: total > 0 ? `${Math.round((completed/total)*100)}% success rate` : '0% success rate',
      badge: 'Extracted & Indexed',
      badgeVariant: 'success' as const,
      icon: CheckCircle2,
      accentColor: 'text-[#059669] dark:text-[#34D399]',
      subtext: 'Ready for queries',
    },
    {
      title: 'Failed',
      value: failed.toString(),
      change: failed > 0 ? 'Needs review' : 'No errors',
      badge: `${failed} exceptions flagged`,
      badgeVariant: failed > 0 ? 'error' as const : 'success' as const,
      icon: AlertTriangle,
      accentColor: 'text-[#E11D48] dark:text-[#F87171]',
      subtext: 'Check logs for details',
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
