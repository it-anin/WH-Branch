const TONES = {
  error: {
    background: '#8f1d14',
    border: '#5f110b',
    color: '#fff',
  },
  warn: {
    background: '#fff0d8',
    border: '#c66a00',
    color: '#6b3600',
  },
};

export default function FirestoreStatusBanner({ alert, onDismiss }) {
  if (!alert) return null;
  const tone = TONES[alert.tone] || TONES.error;

  return (
    <div
      role="alert"
      data-firestore-alert={alert.code}
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(760px, calc(100vw - 20px))',
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 14px',
        border: `2px solid ${tone.border}`,
        borderRadius: 10,
        boxShadow: `4px 4px 0 ${tone.border}`,
        background: tone.background,
        color: tone.color,
        fontFamily: 'system-ui',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1.2 }}>
        {alert.tone === 'warn' ? '⚠️' : '⛔'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{alert.title}</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>{alert.message}</div>
        <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3 }}>
          จุดที่พบ: {alert.source} · {alert.code}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="ปิดการแจ้งเตือน Firestore"
        style={{
          border: '1px solid currentColor',
          borderRadius: 6,
          padding: '3px 8px',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'system-ui',
          fontWeight: 700,
        }}
      >
        รับทราบ
      </button>
    </div>
  );
}

