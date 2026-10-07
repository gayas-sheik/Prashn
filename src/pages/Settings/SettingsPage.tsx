import React, { useState } from 'react';
import { 
  User, 
  Palette, 
  Cpu, 
  Bell, 
  Shield, 
  Database, 
  Sun, 
  Moon, 
  Laptop, 
  Save, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'ocr' | 'notifications' | 'security' | 'storage'>('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [fullName, setFullName] = useState(user?.name || 'Alex Parker');
  const [email, setEmail] = useState(user?.email || 'alex.parker@enterprise.internal');
  const [organization, setOrganization] = useState(user?.organization || 'CloudTech Solutions Ltd.');
  const [timezone, setTimezone] = useState('UTC-05:00 Eastern Time');
  const [currency, setCurrency] = useState('USD ($)');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // OCR Preferences
  const [autoDetect, setAutoDetect] = useState(true);
  const [ocrEngine, setOcrEngine] = useState('AWS Textract + Prashn LayoutLMv3');
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [extractTotals, setExtractTotals] = useState(true);
  const [extractTaxes, setExtractTaxes] = useState(true);
  const [vendorMatching, setVendorMatching] = useState(true);

  // Notifications
  const [notifyIngestion, setNotifyIngestion] = useState(true);
  const [notifyFailures, setNotifyFailures] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/T0019/B0021/X992182048');

  // Sessions
  const [sessions, setSessions] = useState([
    { id: 's-1', device: 'Mac OS Chrome · us-east-1', active: true, time: 'Active Now' },
    { id: 's-2', device: 'Mobile App: iOS 17.4 · New York', active: false, time: '2 days ago' },
  ]);

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleRevokeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const navTabs = [
    { id: 'profile' as const, label: 'Profile & Account', icon: User },
    { id: 'appearance' as const, label: 'Appearance & Display', icon: Palette },
    { id: 'ocr' as const, label: 'Processing & OCR Engine', icon: Cpu },
    { id: 'notifications' as const, label: 'Notifications & Alerts', icon: Bell },
    { id: 'security' as const, label: 'Security & Sessions', icon: Shield },
    { id: 'storage' as const, label: 'Storage & Cloud Data', icon: Database },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
            Settings & Configuration
          </h1>
          <p className="text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Manage account profile, appearance themes, OCR pipeline parameters, notifications, and security.
          </p>
        </div>

        {/* Top-Right Controls */}
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-[12px] font-medium text-[#059669] flex items-center gap-1 animate-fade-in">
              <CheckCircle2 className="w-4 h-4" /> Preferences Saved!
            </span>
          )}
          <Button variant="secondary" size="md">
            Discard Changes
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSave}
          >
            Save Preferences
          </Button>
        </div>
      </div>

      {/* Settings Layout: Left Sub-Navigation Tabs & Right Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Sub-Nav Tabs (3 cols) */}
        <div className="md:col-span-3 space-y-1">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[4px] text-[13px] font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA] font-semibold border-l-2 border-[#1E40AF]'
                    : 'text-[#444653] dark:text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#28394E] hover:text-[#0F172A]'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Settings Pane (9 cols) */}
        <div className="md:col-span-9 space-y-6">
          {/* TAB 1: Profile & Account */}
          {activeTab === 'profile' && (
            <Card title="Profile & Workspace Details" subtitle="Your corporate identity and organization parameters">
              <div className="space-y-4 text-[13px]">
                {/* User Avatar Card */}
                <div className="flex items-center gap-4 p-3 bg-[#F8FAFC] dark:bg-[#162032] rounded-[4px] border border-[#E2E8F0] dark:border-[#2D3F5A]">
                  <div className="w-12 h-12 rounded-full bg-[#1E40AF] text-white flex items-center justify-center font-bold text-[16px]">
                    AP
                  </div>
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      {fullName}
                    </div>
                    <div className="text-[12px] text-[#64748B] dark:text-[#94A3B8]">
                      Role: Admin / Cloud Architect
                    </div>
                    <Badge variant="primary" className="mt-1">
                      Organization Admin
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Work Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Organization
                    </label>
                    <input
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                    >
                      <option value="UTC-05:00 Eastern Time">UTC-05:00 Eastern Time (US & Canada)</option>
                      <option value="UTC+00:00 UTC">UTC+00:00 Coordinated Universal Time</option>
                      <option value="UTC+05:30 IST">UTC+05:30 India Standard Time</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Default Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                    >
                      <option value="USD ($)">USD ($) - US Dollar</option>
                      <option value="EUR (€)">EUR (€) - Euro</option>
                      <option value="GBP (£)">GBP (£) - British Pound</option>
                      <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 2: Appearance & Display */}
          {activeTab === 'appearance' && (
            <Card title="Appearance & Theme Preferences" subtitle="Configure system look and interface density">
              <div className="space-y-6">
                <div>
                  <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-2">
                    Interface Theme Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Light Mode Card */}
                    <div
                      onClick={() => setTheme('light')}
                      className={`p-3.5 rounded-[4px] border-2 cursor-pointer transition-all ${
                        theme === 'light'
                          ? 'border-[#1E40AF] bg-[#EFF6FF] dark:bg-[#1E3A8A30]'
                          : 'border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Sun className="w-5 h-5 text-[#D97706]" />
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'light'}
                          onChange={() => setTheme('light')}
                          className="text-[#1E40AF]"
                        />
                      </div>
                      <div className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
                        Light Mode
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Crisp neutral slate with high contrast
                      </div>
                    </div>

                    {/* Dark Mode Card */}
                    <div
                      onClick={() => setTheme('dark')}
                      className={`p-3.5 rounded-[4px] border-2 cursor-pointer transition-all ${
                        theme === 'dark'
                          ? 'border-[#1E40AF] bg-[#EFF6FF] dark:bg-[#1E3A8A30]'
                          : 'border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Moon className="w-5 h-5 text-[#38BDF8]" />
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'dark'}
                          onChange={() => setTheme('dark')}
                          className="text-[#1E40AF]"
                        />
                      </div>
                      <div className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
                        Dark Mode
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Deep charcoal surfaces with restrained blue accents
                      </div>
                    </div>

                    {/* System Card */}
                    <div
                      onClick={() => setTheme('system')}
                      className={`p-3.5 rounded-[4px] border-2 cursor-pointer transition-all ${
                        theme === 'system'
                          ? 'border-[#1E40AF] bg-[#EFF6FF] dark:bg-[#1E3A8A30]'
                          : 'border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Laptop className="w-5 h-5 text-[#64748B]" />
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'system'}
                          onChange={() => setTheme('system')}
                          className="text-[#1E40AF]"
                        />
                      </div>
                      <div className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
                        System Default
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Follow operating system preference
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Density Mode
                    </label>
                    <select
                      value={density}
                      onChange={(e) => setDensity(e.target.value as any)}
                      className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC]"
                    >
                      <option value="comfortable">Comfortable (Standard 44px rows)</option>
                      <option value="compact">Compact (Dense 36px tables)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                      Display Language
                    </label>
                    <select className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC]">
                      <option>English (US) — Primary</option>
                      <option>English (UK)</option>
                      <option>Deutsch</option>
                      <option>日本語</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 3: Processing & OCR Engine */}
          {activeTab === 'ocr' && (
            <Card title="Cloud OCR & Ingestion Pipeline Preferences" subtitle="Control extraction thresholds and pipeline models">
              <div className="space-y-4 text-[13px]">
                {/* Auto-detect toggle */}
                <div className="flex items-center justify-between p-3 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A]">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Default Document Classification: Auto-Detect
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      Automatically classifies invoices, receipts, and forms without manual tags.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoDetect}
                    onChange={(e) => setAutoDetect(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1E40AF]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Optical Character Recognition Engine
                  </label>
                  <select
                    value={ocrEngine}
                    onChange={(e) => setOcrEngine(e.target.value)}
                    className="w-full h-[36px] px-3 text-[13px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC]"
                  >
                    <option value="AWS Textract + Prashn LayoutLMv3">AWS Textract + Prashn LayoutLMv3 (Recommended)</option>
                    <option value="AWS Textract Tables Only">AWS Textract Standard (Fast Tables)</option>
                    <option value="Prashn High-Precision OCR">Prashn High-Precision Local Ingest</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1]">
                      Extraction Confidence Threshold: {confidenceThreshold}%
                    </label>
                    <span className="text-[11px] text-[#64748B]">Flag below for human review</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="99"
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                    className="w-full accent-[#1E40AF]"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-[#E2E8F0] dark:border-[#334155]">
                  <span className="text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] block">
                    Automatic Metadata Parsing Rules
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extractTotals}
                      onChange={(e) => setExtractTotals(e.target.checked)}
                      className="rounded text-[#1E40AF]"
                    />
                    <span>Reconcile invoice line items against grand total (Tax verification)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extractTaxes}
                      onChange={(e) => setExtractTaxes(e.target.checked)}
                      className="rounded text-[#1E40AF]"
                    />
                    <span>Auto-calculate and isolate VAT / Sales Tax subtotals</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vendorMatching}
                      onChange={(e) => setVendorMatching(e.target.checked)}
                      className="rounded text-[#1E40AF]"
                    />
                    <span>Match vendors against Enterprise vendor database & Tax IDs</span>
                  </label>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 4: Notifications & Alerts */}
          {activeTab === 'notifications' && (
            <Card title="Notifications & Webhook Alerts" subtitle="Configure event dispatches and external channel endpoints">
              <div className="space-y-4 text-[13px]">
                <label className="flex items-center justify-between p-3 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Ingestion Complete Notifications
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      Receive in-app alerts and email summaries when document batches finish.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyIngestion}
                    onChange={(e) => setNotifyIngestion(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1E40AF]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      OCR Extraction Failure / DLQ Alerts
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      Immediate email & webhook dispatch on unreadable resolution or parser exceptions.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyFailures}
                    onChange={(e) => setNotifyFailures(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1E40AF]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] cursor-pointer">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      Weekly Operations Digest
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      Summary report with processing volume, accuracy metrics, and costs.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={weeklyDigest}
                    onChange={(e) => setWeeklyDigest(e.target.checked)}
                    className="w-4 h-4 rounded text-[#1E40AF]"
                  />
                </label>

                <div>
                  <label className="block text-[12px] font-semibold text-[#334155] dark:text-[#CBD5E1] mb-1">
                    Slack Alert Webhook URL
                  </label>
                  <input
                    type="text"
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    className="w-full h-[36px] px-3 font-mono text-[12px] rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* TAB 5: Security & Sessions */}
          {activeTab === 'security' && (
            <Card title="Security & Session Management" subtitle="Manage two-factor auth and active devices">
              <div className="space-y-4 text-[13px]">
                <div className="flex items-center justify-between p-3 rounded-[4px] bg-[#ECFDF5] dark:bg-[#064E3B20] border border-[#A7F3D0] dark:border-[#065F46]">
                  <div>
                    <div className="font-semibold text-[#065F46] dark:text-[#34D399]">
                      Two-Factor Authentication (2FA) Active
                    </div>
                    <div className="text-[12px] text-[#065F46] dark:text-[#A7F3D0]">
                      Secured with TOTP Authenticator App.
                    </div>
                  </div>
                  <Badge variant="success">Enabled</Badge>
                </div>

                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] mb-2 font-mono">
                    Active Sessions List
                  </h4>
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155]"
                      >
                        <div>
                          <div className="font-medium text-[#0F172A] dark:text-[#F8FAFC]">
                            {s.device}
                          </div>
                          <div className="text-[11px] text-[#64748B] font-mono">{s.time}</div>
                        </div>
                        {s.active ? (
                          <span className="text-[11px] text-[#059669] font-medium">Current Session</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRevokeSession(s.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#334155]">
                  <Button variant="secondary" size="sm">
                    Update Master Password
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 6: Storage & Cloud Data */}
          {activeTab === 'storage' && (
            <Card title="Storage Quota & Data Retention" subtitle="Amazon S3 bucket lifecycle rules and cold storage tiers">
              <div className="space-y-4 text-[13px]">
                <div className="p-3 bg-[#F8FAFC] dark:bg-[#162032] rounded-[4px] border border-[#E2E8F0] dark:border-[#2D3F5A] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      S3 Bucket: prashn-vault-east1
                    </span>
                    <span className="font-mono text-[#1E40AF] dark:text-[#60A5FA]">
                      14.2 GB of 50.0 GB (28%)
                    </span>
                  </div>
                  <div className="w-full bg-[#E2E8F0] dark:bg-[#334155] h-2 rounded-[2px] overflow-hidden">
                    <div className="bg-[#1E40AF] h-full" style={{ width: '28%' }} />
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Lifecycle Rule: Processed documents auto-archive to S3 Glacier after 365 days.
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="p-3.5 rounded-[4px] border border-[#FECDD3] dark:border-[#9F1239] bg-[#FFF1F2] dark:bg-[#88133720] space-y-2">
                  <h4 className="font-bold text-[#9F1239] dark:text-[#F87171] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Danger Zone
                  </h4>
                  <p className="text-[12px] text-[#881337] dark:text-[#FECDD3]">
                    Irreversible actions that purge active indices or disconnect cloud storage.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <Button size="sm" variant="destructive">
                      Purge Inactive Index
                    </Button>
                    <Button size="sm" variant="secondary" className="text-[#E11D48]">
                      Delete Account
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
