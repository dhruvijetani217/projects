import React, { useState, useEffect } from 'react';
import {
  Bell,
  MessageCircle,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles,
  KeyRound,
  Phone,
  Info
} from 'lucide-react';
import * as api from '../api/client';
import { ApiError } from '../api/config';

export const NotificationSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ whatsapp_sent: boolean; email_sent: boolean } | null>(null);

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappApikey, setWhatsappApikey] = useState('');

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailAppPassword, setEmailAppPassword] = useState('');

  const [currentWhatsappPhone, setCurrentWhatsappPhone] = useState<string | null>(null);
  const [currentEmailAddress, setCurrentEmailAddress] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getNotificationSettings();
        setWhatsappEnabled(s.whatsappEnabled);
        setEmailEnabled(s.emailEnabled);
        setCurrentWhatsappPhone(s.whatsappPhone);
        setCurrentEmailAddress(s.emailAddress);
        if (s.whatsappPhone) setWhatsappPhone(s.whatsappPhone);
        if (s.emailAddress) setEmailAddress(s.emailAddress);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load settings - is the backend running?');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    setTestResult(null);
    try {
      const updated = await api.updateNotificationSettings({
        whatsappEnabled,
        whatsappPhone: whatsappPhone || undefined,
        whatsappApikey: whatsappApikey || undefined,
        emailEnabled,
        emailAddress: emailAddress || undefined,
        emailAppPassword: emailAppPassword || undefined,
      });
      setCurrentWhatsappPhone(updated.whatsappPhone);
      setCurrentEmailAddress(updated.emailAddress);
      setWhatsappApikey('');
      setEmailAppPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await api.testNotifications();
      setTestResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="text-xs font-semibold text-slate-400">Loading Notification Gateway...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-6 space-y-6 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 shadow-xl flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Notification Dispatcher Gateway</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE GATEWAY
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Configure real-time security alerts to deliver directly to your private WhatsApp phone number and Gmail mailbox when an intruder, unknown face, or safety violation is detected.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2.5 shadow-lg">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2.5 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">Notification settings saved and synchronized successfully!</span>
        </div>
      )}

      {/* WhatsApp Dispatcher Card */}
      <div className={`rounded-2xl border transition-all duration-200 p-6 space-y-5 shadow-xl ${
        whatsappEnabled ? 'bg-slate-900/90 border-emerald-500/40 shadow-emerald-500/5' : 'bg-slate-900/60 border-slate-800'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-100">WhatsApp Instant Alerts</span>
                {currentWhatsappPhone && whatsappEnabled && (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800/50">
                    ● Connected: +{currentWhatsappPhone}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Direct instant messaging via CallMeBot API</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWhatsappEnabled(!whatsappEnabled)}
            className={`w-11 h-6 inline-flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer shrink-0 ${
              whatsappEnabled ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-700/90 border border-slate-600'
            }`}
            aria-pressed={whatsappEnabled}
            title={whatsappEnabled ? 'Disable WhatsApp Alerts' : 'Enable WhatsApp Alerts'}
          >
            <span
              className={`pointer-events-none inline-block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                whatsappEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {whatsappEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-800/80 animate-in fade-in duration-200">
            <div className="text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-emerald-400" />
                <span>One-Time Activation Setup (Takes ~1 minute):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                <li>Open WhatsApp on the phone number that should receive surveillance alerts.</li>
                <li>Tap the green activation button below to send the authorization message:</li>
              </ol>

              <div className="py-1">
                <a
                  href="https://wa.me/34644519523?text=I%20allow%20callmebot%20to%20send%20me%20messages"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/25 transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Open WhatsApp &amp; Authorize CallMeBot</span>
                </a>
              </div>

              <p className="text-[11px] text-slate-400">
                Within a minute, CallMeBot (<span className="font-mono text-slate-300 font-bold">+34 644 51 95 23</span>) will reply with your personal <span className="text-emerald-300 font-bold">API Key</span>. Copy and paste it below.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp Number (with country code)
                </label>
                <input
                  type="text"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="e.g. 919876543210"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" /> CallMeBot API Key
                </label>
                <input
                  type="text"
                  value={whatsappApikey}
                  onChange={(e) => setWhatsappApikey(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gmail Dispatcher Card */}
      <div className={`rounded-2xl border transition-all duration-200 p-6 space-y-5 shadow-xl ${
        emailEnabled ? 'bg-slate-900/90 border-sky-500/40 shadow-sky-500/5' : 'bg-slate-900/60 border-slate-800'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-inner">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-100">Email &amp; Gmail Alerts</span>
                {currentEmailAddress && emailEnabled && (
                  <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded-md border border-sky-800/50">
                    ● Connected: {currentEmailAddress}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Instant HTML email reports with incident snapshots</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEmailEnabled(!emailEnabled)}
            className={`w-11 h-6 inline-flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer shrink-0 ${
              emailEnabled ? 'bg-sky-500 shadow-md shadow-sky-500/30' : 'bg-slate-700/90 border border-slate-600'
            }`}
            aria-pressed={emailEnabled}
            title={emailEnabled ? 'Disable Email Alerts' : 'Enable Email Alerts'}
          >
            <span
              className={`pointer-events-none inline-block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                emailEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {emailEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-800/80 animate-in fade-in duration-200">
            <div className="text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-sky-400 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-sky-400" />
                <span>Gmail App Password Setup:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                <li>Enable <strong className="text-slate-200">2-Step Verification</strong> on your Google Account security settings.</li>
                <li>Create an <strong className="text-slate-200">App Password</strong> for "VisionAI" in Google Account.</li>
                <li>Paste the 16-character generated password below (no spaces).</li>
              </ol>

              <div className="pt-1 flex items-center gap-3">
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-bold bg-sky-950/60 px-3 py-1.5 rounded-lg border border-sky-800/60"
                >
                  <span>Generate App Password</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-400" /> Sender / Receiver Gmail Address
                </label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="e.g. security@company.com"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-sky-400" /> 16-Character App Password
                </label>
                <input
                  type="password"
                  value={emailAppPassword}
                  onChange={(e) => setEmailAppPassword(e.target.value)}
                  placeholder="•••• •••• •••• ••••"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span>Save Notification Configuration</span>
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-indigo-400" />}
          <span>Send Live Test Alert</span>
        </button>
      </div>

      {/* Test Results Display */}
      {testResult && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3 shadow-xl animate-in fade-in">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Real-Time Diagnostic Test Results</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
              testResult.whatsapp_sent ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}>
              {testResult.whatsapp_sent ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              <div>
                <div className="font-bold text-xs">WhatsApp Dispatch</div>
                <div className="text-[11px] opacity-80">{testResult.whatsapp_sent ? 'Alert delivered to phone successfully' : 'Not sent - verify phone & API key'}</div>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
              testResult.email_sent ? 'bg-sky-950/40 border-sky-800 text-sky-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}>
              {testResult.email_sent ? <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              <div>
                <div className="font-bold text-xs">Email Dispatch</div>
                <div className="text-[11px] opacity-80">{testResult.email_sent ? 'Alert email delivered successfully' : 'Not sent - verify Gmail & App Password'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};