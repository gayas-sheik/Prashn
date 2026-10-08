import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { Card } from '../ui/Card';
import { apiClient } from '../../services/api/apiClient';

export const PipelineHealthCard = () => {
  const [metrics, setMetrics] = useState<{ queued: number; active: number; totalBytes: number; concurrency: number; qaMode: string; completed: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try { const data = await apiClient('/documents/metrics'); if (!disposed) { setMetrics(data.metrics); setError(''); } }
      catch (err) { if (!disposed) setError(err instanceof Error ? err.message : 'Metrics unavailable'); }
    };
    void refresh(); const timer = setInterval(refresh, 3000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  return <Card title={<div className="flex items-center gap-2"><Server className="w-4 h-4 text-[#1E40AF]" /><span>Pipeline Health & Storage</span></div>} subtitle="Live local processing metrics for your documents">
    {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : metrics ? <div className="space-y-3 text-[12px]">
      {Object.entries({ 'Queued documents': metrics.queued, 'Active documents': metrics.active, 'Worker limit': metrics.concurrency, 'Completed documents': metrics.completed, 'Failed documents': metrics.failed, 'Original file storage': `${(metrics.totalBytes / 1024 / 1024).toFixed(2)} MB`, 'Extraction': 'PDF text + local Tesseract OCR', 'Q&A': metrics.qaMode === 'ollama' ? 'Local language model' : 'Document fields and passages' }).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><span className="text-[#64748B]">{label}</span><span className="font-mono text-right">{value}</span></div>)}
    </div> : <p className="text-xs text-[#64748B]">Loading metrics...</p>}
  </Card>;
};
