import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { PROFILES } from '../branches.js';

// หน้า Login โปรไฟล์รายที่ทำงาน (A1 เบา) — ใช้ร่วมทั้ง Android + Desktop
// รหัสผ่านเก็บใน Firestore config/auth.passwords (ตั้งใน console) — อ่านครั้งเดียวด้วย getDoc, เทียบ client-side
// ⚠ ไม่ใช่ security จริง (rules เปิด → รหัสอ่านได้ฝั่ง client) — เป็นแค่ประตูแยกมุมมอง/กันเลือกผิด
const fullScreen = {
  position: 'fixed', inset: 0, overflowY: 'auto',
  background: 'var(--paper)', display: 'flex', flexDirection: 'column',
};
const cardBtn = {
  padding: '9px 16px', border: '2px solid var(--line)', borderRadius: 14,
  background: 'white', boxShadow: '2px 2px 0 var(--line)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
};

export default function Login({ onLogin, showToast }) {
  const [picked, setPicked] = useState(null); // โปรไฟล์ที่เลือก (รอกรอกรหัส)
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit() {
    if (!picked || !password || checking) return;
    setChecking(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'auth'));
      const passwords = snap.exists() ? (snap.data().passwords || {}) : {};
      if (String(passwords[picked.code] ?? '') === password) {
        localStorage.setItem('wh_profile', picked.code);
        onLogin(picked);
      } else {
        showToast?.('⚠ รหัสผ่านไม่ถูกต้อง', 'error');
        setPassword('');
      }
    } catch (err) {
      showToast?.('⚠ เชื่อมต่อไม่ได้: ' + (err.code || err.message), 'error');
    } finally {
      setChecking(false);
    }
  }

  // ── ขั้นกรอกรหัส ──
  if (picked) {
    return (
      <div style={fullScreen}>
        <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '14px 24px', width: '100%', maxWidth: 320, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>เข้าสู่ระบบ</div>
          <div style={{ fontFamily: 'system-ui', fontSize: 14, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '4px 14px', borderRadius: 999 }}>
            {picked.warehouse ? '📦 WAREHOUSE' : `🏢 สาขา ${picked.name}`}
          </div>
          <input
            className="input"
            type="password"
            placeholder="รหัสผ่าน"
            autoFocus
            value={password}
            style={{ width: '100%', textAlign: 'center', fontSize: 18, padding: '10px 12px' }}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
          <button className="btn primary lg" style={{ width: '100%' }} disabled={!password || checking} onClick={submit}>
            {checking ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
          <button className="btn ghost sm" onClick={() => { setPicked(null); setPassword(''); }}>← เปลี่ยนที่ทำงาน</button>
        </div>
      </div>
    );
  }

  // ── ขั้นเลือกที่ทำงาน ──
  return (
    <div style={fullScreen}>
      <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 24px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 34 }}>📍</div>
        <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>เลือกที่ทำงาน</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
          {PROFILES.map((p, i) => (
            <button
              key={p.code}
              className="loc-btn"
              onClick={() => setPicked(p)}
              style={{ ...cardBtn, ...(p.warehouse ? { border: '2px solid var(--accent)', background: 'var(--accent-soft)' } : { animationDelay: `${i * 70}ms` }) }}
            >
              <span style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, color: p.warehouse ? 'var(--accent)' : 'var(--ink)' }}>
                {p.warehouse ? '📦 WAREHOUSE' : p.name}
              </span>
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: p.warehouse ? 'var(--accent)' : 'var(--mute)' }}>
                {p.warehouse ? 'แพ็คกิ้ง' : 'รับสินค้า'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
