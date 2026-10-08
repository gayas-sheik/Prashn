import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { getActivityEvents } from '../../services/api/documentService';
import type { ActivityEvent } from '../../types';

export const LiveActivityFeed: React.FC = () => {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const loadEvents = async () => {
      const data = await getActivityEvents();
      setActivities(data.slice(0, 5)); // show latest 5
    };
    loadEvents();
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
          <span>Live Cloud Activity</span>
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
