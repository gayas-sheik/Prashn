import React from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Server, Key, ExternalLink } from 'lucide-react';
import { Card } from '../ui/Card';

export const PipelineHealthCard: React.FC = () => {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
          <span>Pipeline Health & Quota</span>
        </div>
      }
      subtitle="AWS resource limits & provisioned throughput"
    >
      <div className="space-y-4">
        {/* Metric 1: TPS */}
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-[#334155] dark:text-[#CBD5E1] font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#64748B]" />
              AWS Textract TPS
            </span>
            <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC] font-semibold tabular-nums">
              14 / 50 req/sec
            </span>
          </div>
          <div className="w-full bg-[#E2E8F0] dark:bg-[#334155] h-2 rounded-[2px] overflow-hidden">
            <div
              className="bg-[#059669] h-full rounded-[2px] transition-all duration-500"
              style={{ width: '28%' }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#64748B] dark:text-[#94A3B8] mt-1 font-mono">
            <span>Utilization: 28%</span>
            <span>Capacity: Healthy</span>
          </div>
        </div>

        {/* Metric 2: Daily Ingestion */}
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-[#334155] dark:text-[#CBD5E1] font-medium flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#64748B]" />
              Daily Ingestion Volume
            </span>
            <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC] font-semibold tabular-nums">
              420 MB / 2.0 GB tier
            </span>
          </div>
          <div className="w-full bg-[#E2E8F0] dark:bg-[#334155] h-2 rounded-[2px] overflow-hidden">
            <div
              className="bg-[#1E40AF] h-full rounded-[2px] transition-all duration-500"
              style={{ width: '21%' }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#64748B] dark:text-[#94A3B8] mt-1 font-mono">
            <span>1,580 MB available today</span>
            <span>Reset in 8h</span>
          </div>
        </div>

        {/* Quick Action */}
        <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#334155]">
          <Link
            to="/settings"
            className="flex items-center justify-between p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] hover:border-[#1E40AF] text-[12px] text-[#1E40AF] dark:text-[#60A5FA] font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5" />
              Configure Webhooks & API Keys
            </span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </Card>
  );
};
