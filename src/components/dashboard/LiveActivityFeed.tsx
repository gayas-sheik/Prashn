import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { getActivityEvents } from '../../services/api/documentService';
import type { ActivityEvent } from '../../types';

export const LiveActivityFeed: React.FC = () => {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const loadEvents = async () => {
      try {
        const data = await getActivityEvents();
        if (!disposed) { setActivities(data.slice(0, 5)); setError(''); }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Unable to load activity');
      } finally { if (!disposed) setLoading(false); }
    };
    void loadEvents();
    const timer = setInterval(loadEvents, 3000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);

  const getIconAndColor = (status: string) => {
    switch (status) {
      case 'Success':
        return { icon: CheckCircle2, color: 'text-[#059669]' };
      case 'Failed':
        return { icon: AlertTriangle, color: 'text-[#E11D48]' };
      case 'Processing':
      case 'Queued':
        return { icon: Clock, color: 'text-[#0284C7]' };
      default:
        return { icon: Activity, color: 'text-[#64748B]' };
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
          <span>Live Activity</span>
        </div>
      }
      subtitle="Live local document processing events"
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
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {loading && <p role="status" className="text-xs text-[#64748B]">Loading activity...</p>}
        {!loading && !error && !activities.length && <p className="text-xs text-[#64748B]">No activity yet.</p>}
        {activities.map((a) => {
          const { icon: Icon, color } = getIconAndColor(a.status);
          return (
            <div
              key={a.id}
              className="flex items-start gap-2.5 p-2 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A]"
            >
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                  {a.documentName}: {a.event}
                </p>
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
