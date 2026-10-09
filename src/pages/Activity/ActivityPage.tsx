import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Radio, 
  X
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { ActivityEvent } from '../../types';
import { PipelineHealthCard } from '../../components/dashboard/PipelineHealthCard';
import { getActivityEvents } from '../../services/api/documentService';

export const ActivityPage: React.FC = () => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedNode, setSelectedNode] = useState('All');
  const [liveStreamActive, setLiveStreamActive] = useState(true);
  const [selectedLogJson, setSelectedLogJson] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getActivityEvents();
        setEvents(data);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load activity');
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
    if (!liveStreamActive) return;
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, [liveStreamActive]);

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.documentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.documentId && e.documentId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedEventType === 'All' ? true : e.event.includes(selectedEventType);
    const matchesStatus = selectedStatus === 'All' ? true : e.status === selectedStatus;
    const matchesNode = selectedNode === 'All' ? true : e.actor.includes(selectedNode);

    return matchesSearch && matchesType && matchesStatus && matchesNode;
  });

  const handleExport = (format: 'json' | 'csv') => {
    let content = '';
    let mimeType = '';
    let filename = '';

    if (format === 'json') {
      content = JSON.stringify(filteredEvents, null, 2);
      mimeType = 'application/json';
      filename = `prashn_activity_log_${Date.now()}.json`;
    } else {
      content = 'ID,Timestamp,Event,Document,Actor,Status,Details\n' +
        filteredEvents.map(e => `"${e.id}","${e.timestamp}","${e.event}","${e.documentName}","${e.actor}","${e.status}","${e.details}"`).join('\n');
      mimeType = 'text/csv';
      filename = `prashn_activity_log_${Date.now()}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getBadgeVariant = (status: ActivityEvent['status']) => {
    switch (status) {
      case 'Success': return 'success';
      case 'Processing': return 'info';
      case 'Failed': return 'error';
      case 'Warning': return 'warning';
      default: return 'neutral';
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8]">Loading activity audit log...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Activity & Audit Log
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Real-time timeline and system telemetry across document ingestion, classification, and API events.
          </p>
        </div>

        {/* Top-Right Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setLiveStreamActive(!liveStreamActive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[12px] font-medium border transition-colors ${
              liveStreamActive
                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46] dark:bg-[#064E3B40] dark:border-[#065F46] dark:text-[#34D399]'
                : 'bg-white border-[#CBD5E1] text-[#64748B] dark:bg-[#1E293B] dark:border-[#475569]'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${liveStreamActive ? 'animate-pulse text-[#059669]' : ''}`} />
            <span>Live Stream: {liveStreamActive ? 'Active' : 'Paused'}</span>
          </button>

          <Button
            size="md"
            variant="secondary"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => handleExport('csv')}
          >
            Export CSV / JSON
          </Button>
        </div>
      </div>

      {/* Key Metrics / Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            Events in Period
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              {events.length}
            </span>
            <span className="text-[11px] text-[#059669] font-medium">Real-time</span>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-mono">Total tracked events</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            Ingestion Success
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-bold text-[#059669] dark:text-[#34D399] tabular-nums">
              {events.length > 0 ? Math.round((events.filter(e => e.status !== 'Failed').length / events.length) * 100) : 0}%
            </span>
            <Badge variant="success">Healthy</Badge>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-mono">{events.filter(e => e.status !== 'Failed').length} / {events.length} passed</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            Avg Processing Latency
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-bold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              {"< 1s"}
            </span>
            <span className="text-[11px] text-[#64748B] font-mono">Local MVP</span>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-mono">Node / Express Extractor</div>
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-4">
          <div className="text-[12px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
            DLQ Warnings / Exceptions
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[26px] font-bold text-[#E11D48] dark:text-[#F87171] tabular-nums">
              {events.filter(e => e.status === 'Failed' || e.status === 'Warning').length}
            </span>
            <Badge variant={events.filter(e => e.status === 'Failed' || e.status === 'Warning').length > 0 ? 'error' : 'success'}>
              {events.filter(e => e.status === 'Failed' || e.status === 'Warning').length > 0 ? 'Needs Review' : 'Clean'}
            </Badge>
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-mono">{events.filter(e => e.status === 'Failed' || e.status === 'Warning').length} items routed to DLQ</div>
        </div>
      </div>

      {/* Main Content Layout (8 cols Table, 4 cols Telemetry Inspector) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Main Activity Timeline & Data Table */}
        <div className="lg:col-span-8 space-y-4">
          <Card noPadding>
            {/* Interactive Filter & Search Toolbar */}
            <div className="p-3 bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by document ID, actor, or event type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-[36px] pl-9 pr-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                {/* Event Type Filter */}
                <select
                  value={selectedEventType}
                  onChange={(e) => setSelectedEventType(e.target.value)}
                  className="h-[36px] px-2.5 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] text-[12px] font-medium text-[#334155] dark:text-[#E2E8F0] focus:outline-none"
                >
                  <option value="All">All Event Types</option>
                  <option value="OCR Extraction">OCR Extraction</option>
                  <option value="Q&A">Document Q&A</option>
                  <option value="Ingestion">Batch Ingestion</option>
                  <option value="Classification">Classification</option>
                  <option value="Warning">Exceptions / DLQ</option>
                  <option value="Deleted">Document Deleted</option>
                  <option value="API Key">API Key</option>
                </select>

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="h-[36px] px-2.5 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] text-[12px] font-medium text-[#334155] dark:text-[#E2E8F0] focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="Success">Success</option>
                  <option value="Processing">Processing</option>
                  <option value="Failed">Failed</option>
                </select>

                {/* Execution Node */}
                <select
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="h-[36px] px-2.5 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] rounded-[4px] text-[12px] font-medium text-[#334155] dark:text-[#E2E8F0] focus:outline-none"
                >
                  <option value="All">All Nodes</option>
                  <option value="System">Processing Worker</option>

                  <option value="Alex Parker">Alex Parker (User)</option>
                </select>
              </div>
            </div>

            {/* Activity Stream Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="h-[36px] bg-[#F8FAFC] dark:bg-[#162032] border-b border-[#E2E8F0] dark:border-[#334155] text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Document / Resource</th>
                    <th className="p-3">Actor / Source</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Details</th>
                    <th className="p-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] dark:divide-[#2B3B52]">
                  {filteredEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-[#F8FAFC] dark:hover:bg-[#243248] transition-colors">
                      <td className="p-3 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                        {evt.timestamp}
                      </td>
                      <td className="p-3 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                        {evt.event}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-[#1E40AF] dark:text-[#60A5FA]">
                        <span className="truncate block max-w-[160px]" title={evt.documentName}>
                          {evt.documentName}
                        </span>
                      </td>
                      <td className="p-3 text-[#475569] dark:text-[#94A3B8] font-mono text-[11px]">
                        {evt.actor}
                      </td>
                      <td className="p-3">
                        <Badge variant={getBadgeVariant(evt.status)}>
                          {evt.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-[#334155] dark:text-[#CBD5E1] max-w-[200px] truncate" title={evt.details}>
                        {evt.details}
                      </td>
                      <td className="p-3 text-right">
                        {evt.logJson && (
                          <button
                            onClick={() => setSelectedLogJson(evt.logJson!)}
                            className="text-[11px] font-mono text-[#1E40AF] dark:text-[#60A5FA] hover:underline"
                          >
                            JSON Log
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column (4 cols): Live Pipeline Health & Telemetry Inspector */}
        <div className="lg:col-span-4 space-y-4">
          <PipelineHealthCard />
        </div>
      </div>

      {/* JSON Log Modal */}
      {selectedLogJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A] bg-opacity-60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] shadow-layer3 overflow-hidden">
            <div className="p-3 border-b border-[#E2E8F0] dark:border-[#334155] flex items-center justify-between">
              <span className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F8FAFC] font-mono">
                Telemetry Log Payload
              </span>
              <button
                onClick={() => setSelectedLogJson(null)}
                className="p-1 rounded-[4px] text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#334155]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 bg-[#0F172A] text-[#E2E8F0] font-mono text-[11px] max-h-96 overflow-auto">
              {JSON.stringify(selectedLogJson, null, 2)}
            </pre>
            <div className="p-3 border-t border-[#E2E8F0] dark:border-[#334155] flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setSelectedLogJson(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
