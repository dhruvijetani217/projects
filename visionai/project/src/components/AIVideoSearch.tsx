import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  CheckCircle2,
  Loader2,
  Info,
  AlertTriangle
} from 'lucide-react';
import { searchVideoEvents } from '../api/client';
import { ApiError, mediaUrl } from '../api/config';
import { RawSnapshot } from '../api/rawTypes';

export const AIVideoSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<RawSnapshot[]>([]);
  const [matchedNames, setMatchedNames] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exampleQueries = [
    'Show unknown visitors',
    'Show today',
    'Show yesterday',
    'Show laptop',
    'Show backpack',
    'Show car',
  ];

  const handleExecuteSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await searchVideoEvents(searchQuery);
      setResults(res.results);
      setMatchedNames(res.matched_employee_names);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search request failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Header & Prompt Bar */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center ring-2 ring-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">AI Video Search</h2>
            <p className="text-xs text-slate-400">
              Real keyword search over your actual stored snapshots - employee names, "unknown", object classes
              (car, laptop, backpack...), and "today"/"yesterday". Not full natural-language understanding yet -
              see the note below.
            </p>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleExecuteSearch(query); }} className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Show unknown visitors, Show laptop, Show yesterday..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-900/90 border border-indigo-500/50 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 shadow-inner"
            />
          </div>
          <button
            type="submit" disabled={isLoading || !query.trim()}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] text-slate-400 font-medium">Try:</span>
          {exampleQueries.map((q, idx) => (
            <button key={idx} onClick={() => handleExecuteSearch(q)}
              className="px-3 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-[11px] hover:text-indigo-300 transition-colors">
              "{q}"
            </button>
          ))}
        </div>

        <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            This matches real fields on stored events (employee name, "unknown", a handful of object classes,
            today/yesterday) - it can't yet parse free-form phrasing like "carrying a laptop near Gate 1" as a
            single semantic query. Full LLM-based search is a planned next step.
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {matchedNames.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Matched employee name(s):</span>
          {matchedNames.map((n) => (
            <span key={n} className="px-2.5 py-0.5 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800">{n}</span>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        {hasSearched && (
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">
            {isLoading ? 'Searching...' : `${results.length} match(es) found`}
          </h3>
        )}

        {hasSearched && !isLoading && !results.length && !error && (
          <div className="p-8 text-center text-slate-500 text-sm">
            No stored events matched that query - this is a real, honest zero, not an empty demo state.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((item) => (
            <div key={item.id} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden hover:border-slate-700 transition-all shadow-xl group">
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
                {item.image_path ? (
                  <img src={mediaUrl(item.image_path)} alt="Matched event" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">No image saved</div>
                )}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/80 text-emerald-400 text-[11px] font-bold border border-slate-800 backdrop-blur">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {Math.round(item.confidence * 100)}%
                </div>
                {item.tracking_id && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-slate-900/90 text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                    {item.tracking_id}
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-100">{item.recognized_name || item.tags?.[0] || item.event_type}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">{t}</span>
                  ))}
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{item.event_type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
