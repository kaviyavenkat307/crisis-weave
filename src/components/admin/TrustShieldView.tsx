import React from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AnomalyFlag, ReportEvidence } from '../../types';
import { VerificationText } from '../StatusText';

interface TrustShieldViewProps {
  anomalies: AnomalyFlag[];
  evidence: Array<ReportEvidence & { location_name?: string; security_flag?: string }>;
  onReviewAnomaly: (id: number, reviewStatus: 'Cleared' | 'Escalated') => void;
}

export const TrustShieldView: React.FC<TrustShieldViewProps> = ({
  anomalies,
  evidence,
  onReviewAnomaly,
}) => {
  const openCount = anomalies.filter((a) => a.review_status === 'Open').length;
  const duplicateHashCount = evidence.filter((e) => e.is_duplicate_hash === 1).length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#1E3043]">
              TrustShield Cybersecurity & Evidence Integrity Centre
            </h2>
            <p className="mt-1 text-xs text-[#697780]">
              Monitors SHA-256 evidence hashes, submission burst anomalies, inventory spikes, and login rate-limit events.
              Flags require coordinator review — accounts are never auto-labeled fraudulent.
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-[#697780]">Open Flags: </span>
              <span className="font-mono-tabular font-bold text-[#D9534F]">{openCount}</span>
            </div>
            <div>
              <span className="text-[#697780]">Duplicate Evidence Hashes: </span>
              <span className="font-mono-tabular font-bold text-[#E49B43]">{duplicateHashCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Anomaly Queue */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-sm font-semibold text-[#1E3043]">Security Anomaly Review Queue</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {anomalies.length === 0 ? (
            <p className="p-6 text-xs text-[#697780]">No security anomalies detected.</p>
          ) : (
            anomalies.map((flag) => (
              <div key={flag.id} className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldAlert
                      className={`h-4 w-4 ${flag.risk_level === 'Suspicious' ? 'text-[#D9534F]' : 'text-[#E49B43]'}`}
                    />
                    <span className="font-semibold text-[#1E3043]">{flag.flag_type}</span>
                    <span className="text-slate-300">·</span>
                    <VerificationText status={flag.risk_level} />
                    <span className="text-slate-300">·</span>
                    <span className="text-[#697780]">Status: {flag.review_status}</span>
                  </div>
                  <p className="text-xs text-[#697780]">{flag.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {flag.review_status === 'Open' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onReviewAnomaly(flag.id, 'Cleared')}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#39856D] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Clear Flag
                      </button>
                      <button
                        type="button"
                        onClick={() => onReviewAnomaly(flag.id, 'Escalated')}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D9534F]/40 px-3 py-1.5 text-xs font-semibold text-[#D9534F]"
                      >
                        Escalate
                      </button>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-[#39856D]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {flag.review_status}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* SHA-256 Evidence Registry */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-sm font-semibold text-[#1E3043]">SHA-256 Evidence Integrity Registry</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[#697780]">
              <tr>
                <th className="px-4 py-3 font-medium">Report</th>
                <th className="px-4 py-3 font-medium">File Name</th>
                <th className="px-4 py-3 font-medium">SHA-256 Digest</th>
                <th className="px-4 py-3 font-medium">Integrity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidence.map((ev) => (
                <tr key={ev.id}>
                  <td className="px-4 py-3 font-mono-tabular">#{ev.report_id}</td>
                  <td className="px-4 py-3 font-medium text-[#1E3043]">{ev.file_name}</td>
                  <td className="px-4 py-3 font-mono-tabular text-[11px] text-[#697780]">
                    {ev.file_hash.slice(0, 24)}...
                  </td>
                  <td className="px-4 py-3">
                    {ev.is_duplicate_hash ? (
                      <span className="font-semibold text-[#D9534F]">Duplicate Hash Detected</span>
                    ) : (
                      <span className="text-[#39856D]">Unique SHA-256</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
