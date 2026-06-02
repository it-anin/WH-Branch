const STYLES = {
  default: { background: 'var(--ink)',  color: 'var(--paper)', border: '2px solid var(--line)',        boxShadow: '3px 3px 0 var(--line)' },
  error:   { background: '#c0392b',     color: '#fff',         border: '2px solid #922b21',             boxShadow: '3px 3px 0 #922b21' },
  success: { background: '#2e7d32',     color: '#fff',         border: '2px solid #1b5e20',             boxShadow: '3px 3px 0 #1b5e20' },
};

export default function Toast({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      zIndex: 300, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          ...STYLES[t.type] || STYLES.default,
          fontFamily: 'system-ui', fontSize: 16,
          padding: '10px 22px', borderRadius: 10,
          whiteSpace: 'nowrap',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
