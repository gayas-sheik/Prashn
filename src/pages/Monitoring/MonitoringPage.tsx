import { useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { getMonitoring, type MonitoringMetric, type MonitoringSnapshot } from '../../services/api/monitoringService';

const timeLabel = (value: string | null) => value ? new Date(value).toLocaleString() : 'Unavailable';
const unavailable = (message?: string) => <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">{message || 'Monitoring data is unavailable.'}</p>;

function MetricChart({ metric }: { metric: MonitoringMetric }) {
  const points = metric.points;
  const latest = points.at(-1);
  const max = Math.max(1, ...points.map(point => point.value));
  const line = points.map((point, index) => `${points.length === 1 ? 250 : 10 + index * 480 / (points.length - 1)},${110 - point.value / max * 100}`).join(' ');
  return <Card title={metric.label} subtitle="5-minute samples · last hour">
    <div className="flex flex-wrap justify-between gap-2 items-baseline">
      <span className="text-2xl font-bold tabular-nums">{latest ? `${Number(latest.value.toFixed(2))}${metric.unit === '%' ? '%' : ''}` : '—'}</span>
      {!metric.complete && <Badge variant="warning">Partial data</Badge>}
    </div>
    {latest ? <>
      <svg viewBox="0 0 500 120" role="img" aria-label={`${metric.label}: ${points.length} measured samples`} className="w-full h-[120px] mt-2">
        <line x1="10" x2="490" y1="110" y2="110" stroke="#CBD5E1" />
        <polyline points={line} fill="none" stroke="#3B82F6" strokeWidth="2" />
        {points.length === 1 && <circle cx="250" cy={110 - latest.value / max * 100} r="3" fill="#3B82F6" />}
      </svg>
      <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Latest sample: {timeLabel(latest.time)}</p>
    </> : <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-3">No samples in this time window. Missing samples are not reported as zero.</p>}
  </Card>;
}

export function MonitoringPage() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (user?.role !== 'admin') return;
    let disposed = false;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      if (!disposed) setLoading(true);
      try { const result = await getMonitoring(); if (!disposed) { setSnapshot(result); setError(''); } }
      catch (err) { if (!disposed) { setSnapshot(null); setError(err instanceof Error ? err.message : 'Monitoring is unavailable.'); } }
      finally { pending = false; if (!disposed) setLoading(false); }
    }
    void load(); const interval = window.setInterval(load, 60000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [user?.role, refresh]);

  if (user?.role !== 'admin') return <Card title="Administrator access required">{unavailable('Cloud monitoring is available only to workspace administrators.')}</Card>;
  return <div className="space-y-6 text-[#0F172A] dark:text-[#F8FAFC]">
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#334155]">
      <div><h1 className="text-[24px] font-bold flex items-center gap-2"><Activity className="w-6 h-6" />Monitoring</h1>
        <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-1">CloudWatch metrics, fleet state, queues, and operational errors.</p></div>
      <Button size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
      <ShieldCheck className="w-4 h-4" /><span>Administrator access · Read only</span>
      {snapshot && <span>Collected: {timeLabel(snapshot.collectedAt)}</span>}<span>Refreshes every minute</span>
    </div>
    {error && <div role="alert" className="p-4 rounded-[6px] border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-300">
      {error} Live monitoring requires the demo API to be running. Refresh after API readiness is confirmed.
    </div>}
    {!snapshot && !error && unavailable(loading ? 'Loading monitoring data…' : 'Waiting for monitoring data…')}
    {snapshot && !snapshot.enabled && <Card title="Cloud monitoring unavailable">{unavailable(snapshot.reason)}</Card>}
    {snapshot?.enabled && <>
      <Card title="Fleet state" subtitle={`Stack ${snapshot.stackStatus || 'state unavailable'} · Instance health comes from Auto Scaling`}>
        {snapshot.fleet?.status !== 'ok' ? unavailable(snapshot.fleet?.message) : <div className="grid sm:grid-cols-2 gap-4">
          {snapshot.fleet.data.map(group => {
            const healthy = group.instances.filter(instance => instance.healthy).length;
            const paused = group.desired === 0 && group.min === 0 && group.max === 0 && group.instances.length === 0;
            const state = paused ? 'Paused' : group.desired === 0 ? 'Stopping / idle' : healthy >= group.desired ? 'In service' : 'Starting / needs review';
            return <div key={group.kind} className="p-3 border border-[#E2E8F0] dark:border-[#334155] rounded-[4px] space-y-2 min-w-0">
              <div className="flex justify-between gap-2"><h2 className="font-semibold">{group.kind} fleet</h2><Badge variant={paused ? 'neutral' : healthy >= group.desired && group.desired > 0 ? 'success' : 'warning'}>{state}</Badge></div>
              <p className="text-2xl font-bold">{group.instances.length}<span className="text-xs font-normal text-[#64748B] ml-2">instances · {healthy} in service and healthy</span></p>
              <p className="text-xs text-[#64748B]">Desired {group.desired} · Min {group.min} · Max {group.max}</p>
              {group.instances.map(instance => <p key={instance.id} className="text-xs font-mono break-all">{instance.id} · {instance.state}</p>)}
            </div>;
          })}
        </div>}
      </Card>
      <Card title="Queues" subtitle="SQS approximate counts at collection time">
        {snapshot.queues?.status !== 'ok' ? unavailable(snapshot.queues?.message) : <div className="grid sm:grid-cols-2 gap-4">{snapshot.queues.data.map(queue =>
          <div key={queue.kind}><h2 className="font-semibold text-sm mb-2">{queue.kind}</h2><div className="grid grid-cols-3 gap-2 text-center">
            {[['Available', queue.visible], ['In flight', queue.inFlight], ['Delayed', queue.delayed]].map(([label, value]) => <div key={label} className="p-2 rounded bg-[#F8FAFC] dark:bg-[#162032]"><div className="text-xl font-bold">{value}</div><div className="text-xs text-[#64748B]">{label}</div></div>)}
          </div></div>)}</div>}
      </Card>
      <div className="grid xl:grid-cols-2 gap-4">{snapshot.metrics?.status === 'ok' ? snapshot.metrics.data.map(metric => <MetricChart key={metric.id} metric={metric} />) : <Card title="CloudWatch metrics">{unavailable(snapshot.metrics?.message)}</Card>}</div>
      <Card title="CloudWatch alarms" subtitle="Configured queue and API error alarms">
        {snapshot.alarms?.status !== 'ok' ? unavailable(snapshot.alarms?.message) : <div className="space-y-3">{snapshot.alarms.data.map(alarm =>
          <div key={alarm.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between text-sm">
            <div className="min-w-0"><p className="break-all">{alarm.name}</p><p className="text-xs text-[#64748B]">Last transition: {timeLabel(alarm.changedAt)}</p></div>
            <Badge variant={alarm.state === 'ALARM' ? 'error' : alarm.state === 'OK' ? 'success' : 'neutral'}>{alarm.state}</Badge>
          </div>)}</div>}
      </Card>
      <Card title="Operational errors" subtitle="Selected structured events from the last 15 minutes">
        {snapshot.errors?.status !== 'ok' ? unavailable(snapshot.errors?.message) : <>
          {snapshot.errors.data.truncated && <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">The bounded log scan is incomplete; additional events may exist.</p>}
          {snapshot.errors.data.entries.length ? <div className="space-y-3">{snapshot.errors.data.entries.map((entry, index) =>
            <div key={`${entry.time}-${index}`} className="text-sm border-b border-[#E2E8F0] dark:border-[#334155] pb-2">
              <p className="font-medium">{entry.event.replace(/_/g, ' ')}{entry.status ? ` · HTTP ${entry.status}` : ''}</p><p className="text-xs text-[#64748B]">{timeLabel(entry.time)} · {entry.category}</p>
            </div>)}</div> : unavailable('No matching operational errors were returned in this scan.')}
        </>}
      </Card>
    </>}
  </div>;
}
