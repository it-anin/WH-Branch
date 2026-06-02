function Step({ num, title, desc, bg }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{
        width: 60, height: 60, margin: '0 auto 8px',
        borderRadius: '50%', background: bg,
        border: '2px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui', fontWeight: 700, fontSize: 30,
        boxShadow: '3px 3px 0 var(--line)',
      }}>{num}</div>
      <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', maxWidth: 160, margin: '0 auto' }}>{desc}</div>
    </div>
  );
}

const Arrow = () => (
  <div style={{ fontFamily: 'system-ui', fontSize: 30, color: 'var(--accent)', alignSelf: 'center' }}>⟶</div>
);

export default function FlowDiagram() {
  return (
    <div className="frame" style={{ padding: 20, display: 'flex', gap: 4, alignItems: 'stretch' }}>
      <Step num="1" title="เปิดลัง" desc="สร้าง BX ใหม่" bg="var(--paper-dark)" />
      <Arrow />
      <Step num="2" title="สแกนสินค้า" desc="10–15 SKU ต่อลัง" bg="var(--yellow)" />
      <Arrow />
      <Step num="3" title="ปิดลัง" desc="ออกเลข POS + barcode" bg="var(--accent-soft)" />
      <Arrow />
      <Step num="4" title="พิมพ์สติกเกอร์" desc="ติดข้างลัง" bg="white" />
      <Arrow />
      <Step num="5" title="ส่งเข้า POS" desc="Export batch" bg="#d8e8c4" />
    </div>
  );
}
