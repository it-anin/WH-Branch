export default function TweaksPanel({ tweaks, setTweaks, open, setOpen }) {
  if (!open) {
    return (
      <button
        className="btn primary"
        style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}
        onClick={() => setOpen(true)}
      >🎛 Tweaks</button>
    );
  }
  const set = (k, v) => setTweaks({ ...tweaks, [k]: v });
  return (
    <div className="tweaks-panel">
      <h3>🎛 Tweaks
        <button onClick={() => setOpen(false)} className="btn sm ghost" style={{ marginLeft: 'auto' }}>×</button>
      </h3>

      <div className="tweak-row">
        <label>Density</label>
        <div className="seg">
          {['compact', 'comfy'].map((v) => (
            <button key={v} className={tweaks.density === v ? 'on' : ''} onClick={() => set('density', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>Scan variant</label>
        <div className="seg">
          {['A', 'B', 'C'].map((v) => (
            <button key={v} className={tweaks.variant === v ? 'on' : ''} onClick={() => set('variant', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>Accent</label>
        <div className="seg">
          {[
            { k: 'orange', c: '#e8692b' },
            { k: 'blue',   c: '#2b6ce8' },
            { k: 'green',  c: '#5c8a3a' },
            { k: 'pink',   c: '#d94a8a' },
          ].map((o) => (
            <button
              key={o.k}
              className={tweaks.accent === o.k ? 'on' : ''}
              onClick={() => set('accent', o.k)}
              style={{ background: tweaks.accent === o.k ? o.c : 'white', color: tweaks.accent === o.k ? 'white' : 'black' }}
            >{o.k}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>Box barcode</label>
        <div className="seg">
          {['1D', 'QR'].map((v) => (
            <button key={v} className={tweaks.barcode === v ? 'on' : ''} onClick={() => set('barcode', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tweak-row">
        <label>Show annotations</label>
        <div className="seg">
          {['on', 'off'].map((v) => (
            <button key={v} className={tweaks.annotations === v ? 'on' : ''} onClick={() => set('annotations', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)', marginTop: 8 }}>
        Tweaks are wireframe-level only.
      </div>
    </div>
  );
}
