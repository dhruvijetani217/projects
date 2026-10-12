import React, { useState } from 'react';
import {
  FileCode2,
  Database,
  Layers,
  Server,
  Workflow,
  Cpu,
  ShieldCheck,
  Code2,
  Copy,
  Check,
  Terminal,
  BookOpen
} from 'lucide-react';
import { mockArchitectureDocs } from '../data/mockData';

export const ArchitectureDocs: React.FC = () => {
  const [activeDocId, setActiveDocId] = useState<string>(mockArchitectureDocs[0].id);
  const [copied, setCopied] = useState(false);

  const currentDoc = mockArchitectureDocs.find((d) => d.id === activeDocId) || mockArchitectureDocs[0];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentDoc.contentMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-indigo-400" /> Enterprise System Architecture & Commercial Blueprint
          </h2>
          <p className="text-xs text-slate-400">
            Complete architectural deliverables (1-12) for multi-tenant enterprise deployment (SaaS & On-Premise).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800 text-xs font-bold font-mono">
            OpenAPI 3.1 & PostgreSQL Schema
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        {/* Left Nav Menu */}
        <div className="lg:col-span-1 p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5 h-max">
          <h3 className="px-3 text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Architectural Deliverables</h3>
          {mockArchitectureDocs.map((doc) => {
            const isActive = doc.id === activeDocId;
            return (
              <button
                key={doc.id}
                onClick={() => setActiveDocId(doc.id)}
                className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                    isActive ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {doc.number}
                  </span>
                  <span className="truncate">{doc.title}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Content Viewer */}
        <div className="lg:col-span-3 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                {currentDoc.category}
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-1">{currentDoc.number}. {currentDoc.title}</h3>
              <p className="text-xs text-slate-400">{currentDoc.subtitle}</p>
            </div>

            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
              {copied ? 'Copied Specification!' : 'Copy Code Specs'}
            </button>
          </div>

          <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-3 font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto text-slate-200 whitespace-pre-wrap">
            {currentDoc.contentMarkdown}
          </div>
        </div>
      </div>
    </div>
  );
};
