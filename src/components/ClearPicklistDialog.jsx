export default function ClearPicklistDialog({ normalCount, urgentCount, clearing, onClear, onClose }) {
  const options = [
    {
      kind: 'normal',
      icon: '📋',
      title: 'Picklist ปกติ',
      count: normalCount,
      description: 'ล้างเฉพาะรายการ Picklist ปกติ และเก็บรายการเบิกด่วนไว้',
      color: 'var(--red)',
    },
    {
      kind: 'urgent',
      icon: '📌',
      title: 'Picklist เบิกด่วน',
      count: urgentCount,
      description: 'ล้างเฉพาะรายการเบิกด่วน และเก็บ Picklist ปกติไว้',
      color: '#d95f02',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10020, padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
      onMouseDown={event => { if (!clearing && event.target === event.currentTarget) onClose(); }}
    >
      <div style={{
        width: 'min(620px, 96vw)', padding: 20,
        background: 'var(--paper, #fff)', border: '2px solid var(--ink)', borderRadius: 14,
        boxShadow: '0 18px 55px rgba(0,0,0,0.28)', fontFamily: 'system-ui',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 850 }}>🧹 ล้างรายการ Picklist</div>
            <div style={{ marginTop: 4, color: 'var(--mute)', fontSize: 12 }}>
              เลือกประเภทที่ต้องการล้าง รายการอีกประเภทจะไม่ถูกเปลี่ยนแปลง
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn sm ghost" disabled={clearing} onClick={onClose}>× ปิด</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 18 }}>
          {options.map(option => (
            <div key={option.kind} style={{ padding: 16, border: `1.5px solid ${option.color}`, borderRadius: 12, background: '#fff' }}>
              <div style={{ fontSize: 17, fontWeight: 850 }}>{option.icon} {option.title}</div>
              <div style={{ marginTop: 7, fontSize: 26, fontWeight: 900, color: option.color }}>{option.count}</div>
              <div style={{ color: 'var(--mute)', fontSize: 11 }}>รายการ</div>
              <div style={{ minHeight: 48, marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>{option.description}</div>
              <button
                className="btn sm"
                style={{ width: '100%', marginTop: 12, borderColor: option.color, background: option.color, color: 'white' }}
                disabled={clearing || option.count === 0}
                onClick={() => onClear(option.kind)}
              >
                {clearing ? 'กำลังบันทึก…' : `ล้าง ${option.title}`}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, padding: '10px 12px', border: '1px solid #dfaa31', borderRadius: 9, background: '#fff6d9', color: '#754b00', fontSize: 12, lineHeight: 1.5 }}>
          ⚠ การล้างจะนำรายการที่เลือกออกจากงานแพ็ค แต่จะไม่ลบลังที่ปิดแล้วหรือประวัติย้อนหลัง และระบบจะไม่อนุญาตให้ล้างหากยังมีสินค้าประเภทนั้นกำลังแพ็คอยู่ในลัง
        </div>
      </div>
    </div>
  );
}
