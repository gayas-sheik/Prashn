import { apiClient } from './apiClient';
export type MonitoringSection<T> = { status: 'ok'; data: T } | { status: 'unavailable'; data: null; message: string };
export interface MonitoringFleet { kind: string; name: string; desired: number; min: number; max: number; instances: { id: string; state: string; healthy: boolean }[] }
export interface MonitoringMetric { id: string; label: string; unit: string; complete: boolean; points: { time: string; value: number }[] }
export interface MonitoringSnapshot {
  enabled: boolean; mode: string; collectedAt: string; reason?: string; stackStatus?: string;
  fleet?: MonitoringSection<MonitoringFleet[]>;
  queues?: MonitoringSection<{ kind: string; visible: number; inFlight: number; delayed: number }[]>;
  alarms?: MonitoringSection<{ name: string; state: string; changedAt: string | null }[]>;
  metrics?: MonitoringSection<MonitoringMetric[]>;
  errors?: MonitoringSection<{ windowMinutes: number; truncated: boolean; entries: { time: string; event: string; status: number | null; category: string }[] }>;
}
export const getMonitoring = (): Promise<MonitoringSnapshot> => apiClient('/monitoring');
