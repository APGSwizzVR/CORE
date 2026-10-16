import { useEffect, useState } from 'react';
import { AppWindow, Check, Monitor, RefreshCw, ShieldCheck, X } from 'lucide-react';

type Source = { id: string; name: string; type: 'screen' | 'window'; thumbnail: string; icon: string };

export default function ScreenPicker({ onClose, onShare }: { onClose: () => void; onShare: (sourceId?: string) => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<'screen' | 'window'>('screen');
  const [loading, setLoading] = useState(Boolean(window.coreDesktop));
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!window.coreDesktop) return;
    setLoading(true); setError('');
    try {
      const next = await window.coreDesktop.getDisplaySources();
      setSources(next);
      setSelected((current) => next.some((source) => source.id === current) ? current : next.find((source) => source.type === kind)?.id || next[0]?.id || '');
    } catch {
      setError('CORE couldn’t list your screens. Check Windows desktop app permissions, then try again.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const visibleSources = sources.filter((source) => source.type === kind);
  useEffect(() => {
    if (window.coreDesktop && !visibleSources.some((source) => source.id === selected)) setSelected(visibleSources[0]?.id || '');
  }, [kind, selected, sources]);

  const confirm = async () => {
    if (!window.coreDesktop) return onShare();
    if (!selected) { setError('Choose a screen or app window first.'); return; }
    setLoading(true); setError('');
    try {
      const accepted = await window.coreDesktop.selectDisplaySource(selected);
      if (!accepted) throw new Error();
      onShare(selected);
    } catch { setLoading(false); setError('That source is no longer available. Refresh the list and choose it again.'); }
  };

  return <div className="share-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="share-picker" role="dialog" aria-modal="true" aria-labelledby="share-picker-title">
      <header className="share-picker-head"><div className="share-picker-icon"><Monitor size={18} /></div><div><span className="eyebrow">LIVE SHARE</span><h2 id="share-picker-title">What would you like to show?</h2><p>CORE only shares the screen or window you choose.</p></div><button className="icon-button" aria-label="Close screen sharing" onClick={onClose}><X size={17} /></button></header>
      {window.coreDesktop ? <>
        <div className="share-picker-tabs"><div role="group" aria-label="Source type"><button className={kind === 'screen' ? 'active' : ''} aria-pressed={kind === 'screen'} onClick={() => setKind('screen')}><Monitor size={14} />Entire screen</button><button className={kind === 'window' ? 'active' : ''} aria-pressed={kind === 'window'} onClick={() => setKind('window')}><AppWindow size={14} />App windows</button></div><button onClick={refresh} disabled={loading} aria-label="Refresh screens and windows"><RefreshCw size={14} />Refresh</button></div>
        {loading ? <div className="share-picker-state"><span className="share-loader" /><b>Finding displays and windows…</b></div> : visibleSources.length ? <div className="share-source-grid" role="listbox" aria-label={kind === 'screen' ? 'Displays' : 'App windows'}>
          {visibleSources.map((source) => <button type="button" role="option" aria-selected={selected === source.id} key={source.id} className={`share-source ${selected === source.id ? 'selected' : ''}`} onClick={() => setSelected(source.id)}>
            <span className="share-source-preview">{source.thumbnail ? <img src={source.thumbnail} alt="" /> : <span>{source.type === 'screen' ? <Monitor size={25} /> : <AppWindow size={25} />}</span>}{selected === source.id && <i><Check size={12} /></i>}</span>
            <span className="share-source-title">{source.type === 'screen' ? <Monitor size={13} /> : source.icon ? <img className="share-source-icon" src={source.icon} alt="" /> : <AppWindow size={13} />}<b title={source.name}>{source.name}</b><small>{source.type === 'screen' ? 'Display' : 'Window'}</small></span>
          </button>)}
        </div> : <div className="share-picker-state"><span className="share-empty-icon">{kind === 'screen' ? <Monitor size={19} /> : <AppWindow size={19} />}</span><b>No {kind === 'screen' ? 'displays' : 'app windows'} found</b><span>Open a window or display, then refresh this list.</span></div>}
      </> : <div className="share-browser-choice"><span><AppWindow size={19} /></span><div><b>Choose a screen or window</b><small>Your browser will open its secure screen picker.</small></div></div>}
      <div className="share-picker-privacy"><ShieldCheck size={15} /><span>People in this voice channel can view your share. Stop any time from the call controls or Windows sharing bar.</span></div>
      {error && <p className="share-picker-error" role="alert">{error}</p>}
      <footer className="share-picker-actions"><button className="button subtle" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => void confirm()} disabled={loading || (Boolean(window.coreDesktop) && !selected)}><Monitor size={15} />Share {window.coreDesktop ? kind : 'screen'}</button></footer>
    </section>
  </div>;
}
