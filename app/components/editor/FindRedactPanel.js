'use client';

import { useMemo, useState } from 'react';
import { EyeOff, Loader2, Search } from 'lucide-react';
import { findText } from '@/app/utils/textEditing';

const PATTERNS = [
  { id: 'email', label: 'Email addresses' },
  { id: 'phone', label: 'Phone numbers' },
  { id: 'card', label: 'Card numbers' },
  { id: 'ssn', label: 'US SSNs' },
  { id: 'iban', label: 'IBANs' },
  { id: 'url', label: 'Web links' },
  { id: 'date', label: 'Dates' },
];

const KIND_LABEL = { text: 'Text', email: 'Email', phone: 'Phone', card: 'Card', ssn: 'SSN', iban: 'IBAN', url: 'Link', date: 'Date' };

/**
 * Search the document for words or kinds of personal data and mark every hit for redaction.
 * The marks are ordinary redaction boxes the user can review, move or delete before download.
 */
export default function FindRedactPanel({ pdfFile, numPages, onMark, onGoToPage }) {
  const [query, setQuery] = useState('');
  const [patterns, setPatterns] = useState([]);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [state, setState] = useState({ status: 'idle' });
  const [excluded, setExcluded] = useState(() => new Set());

  const canSearch = Boolean(query.trim() || patterns.length) && state.status !== 'searching';

  const search = async (event) => {
    event?.preventDefault();
    if (!canSearch) return;
    setState({ status: 'searching' });
    setExcluded(new Set());
    try {
      const result = await findText({
        pdfFile,
        query,
        patterns,
        matchCase,
        wholeWord,
        onWaking: (seconds) => setState({ status: 'searching', waking: seconds }),
      });
      setState({ status: 'done', ...result });
    } catch (error) {
      setState({ status: 'error', error: error.message || 'Search failed.' });
    }
  };

  const matches = useMemo(() => (state.status === 'done' ? state.matches.map((m, i) => ({ ...m, key: i })) : []), [state]);
  const chosen = matches.filter((m) => !excluded.has(m.key));
  const pages = new Set(matches.map((m) => m.page)).size;

  return (
    <div className="panel-section panel-stack">
      <form className="panel-stack" onSubmit={search}>
        <div className="field">
          <label className="field-label" htmlFor="redact-query">Find text to redact</label>
          <div className="input-group">
            <input
              id="redact-query"
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Names, numbers… (comma-separated)"
            />
            <button type="submit" className="btn btn-secondary btn-icon" disabled={!canSearch} aria-label="Search">
              {state.status === 'searching' ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            </button>
          </div>
        </div>
        <div className="check-stack">
          <label className="check-row"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
          <label className="check-row"><input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole words only</label>
        </div>
        <div className="field">
          <span className="field-label">Also find</span>
          <div className="chip-list">
            {PATTERNS.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                className="chip"
                aria-pressed={patterns.includes(pattern.id)}
                onClick={() => setPatterns((prev) => (prev.includes(pattern.id) ? prev.filter((p) => p !== pattern.id) : [...prev, pattern.id]))}
              >
                {pattern.label}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={!canSearch}>
          {state.status === 'searching' ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
          {state.status === 'searching' ? (state.waking ? `Starting… ${state.waking}s` : 'Searching…') : 'Search document'}
        </button>
      </form>

      {state.status === 'error' ? <div className="alert alert-error" role="alert">{state.error}</div> : null}

      {state.status === 'done' ? (
        <div className="panel-stack">
          <p className="small muted" role="status">
            {matches.length
              ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} on ${pages} ${pages === 1 ? 'page' : 'pages'}${state.truncated ? ' (showing the first 2,000)' : ''}.`
              : 'No matches found.'}
            {state.scannedPages?.length ? ` ${state.scannedPages.length} scanned ${state.scannedPages.length === 1 ? 'page was' : 'pages were'} not searched; run OCR PDF first or draw boxes on them.` : ''}
          </p>
          {matches.length ? (
            <>
              <ul className="match-list" aria-label="Matches">
                {matches.map((match) => (
                  <li key={match.key}>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={!excluded.has(match.key)}
                        onChange={() =>
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(match.key)) next.delete(match.key);
                            else next.add(match.key);
                            return next;
                          })
                        }
                      />
                      <span className="match-text" title={match.text}>{match.text}</span>
                    </label>
                    <button type="button" className="match-page" onClick={() => onGoToPage(match.page + 1)} title={`Go to page ${match.page + 1}`}>
                      {KIND_LABEL[match.kind] || 'Text'} · p.{match.page + 1}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-danger btn-block"
                disabled={!chosen.length}
                onClick={() => {
                  onMark(chosen);
                  setState({ status: 'idle' });
                }}
              >
                <EyeOff size={15} /> Mark {chosen.length} for redaction
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="small muted">
        Marked areas are removed for good when you download{numPages > 1 ? ', on every page they appear' : ''}. You can also drag over anything with the Redact tool.
      </p>
    </div>
  );
}
