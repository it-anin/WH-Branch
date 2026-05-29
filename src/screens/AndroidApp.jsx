import { useState } from 'react';
import PackScanC from './PackScanC.jsx';
import BranchReceive from './BranchReceive.jsx';

const BRANCH_STAFF = [
  { code: 'BR-01', name: 'ก้า' },
  { code: 'BR-02', name: 'กิ๊ฟ' },
  { code: 'BR-03', name: 'นิคกี้' },
  { code: 'BR-04', name: 'สุ่ย' },
];

export default function AndroidApp({
  screenProps,
  packer, setPacker, PACKERS, catalogByPacker,
  onScanProgress,
}) {
  const [tab, setAndroidTab] = useState('pack');
  const [branchStaff, setBranchStaff] = useState(null);
  const packCatalog = packer ? (catalogByPacker[packer.code] || screenProps.catalog) : screenProps.catalog;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
      overflow: 'hidden',
    }}>

      {/* content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── แพ็คกิ้ง ── */}
        {tab === 'pack' && (
          <>
            {/* packer selector strip */}
            <div style={{
              padding: '8px 12px',
              borderBottom: '1.5px solid var(--line)',
              background: 'var(--paper-dark)',
              display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                พนักงาน:
              </span>
              {PACKERS.map(p => {
                const active = packer?.code === p.code;
                return (
                  <button key={p.code} onClick={() => setPacker(active ? null : p)} style={{
                    padding: '5px 14px',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 999,
                    background: active ? 'var(--accent)' : 'white',
                    color: active ? 'white' : 'var(--ink)',
                    fontFamily: 'Patrick Hand', fontSize: 15,
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                    boxShadow: active ? '2px 2px 0 var(--line)' : '1px 1px 0 var(--line)',
                  }}>
                    {p.name}
                  </button>
                );
              })}
            </div>

            {/* pack content */}
            {packer ? (
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
                <PackScanC
                  key={`${packer.code}-${Object.keys(catalogByPacker).length}`}
                  {...screenProps}
                  catalog={packCatalog}
                  packer={packer}
                  setTab={() => {}}
                  onScanProgress={onScanProgress}
                />
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
              }}>
                <div style={{ fontSize: 52 }}>👆</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', textAlign: 'center' }}>
                  กดปุ่มชื่อพนักงานด้านบนเพื่อดูรายการสินค้าที่ต้องแพ็ค
                </div>
              </div>
            )}
          </>
        )}

        {/* ── รับสินค้า ── */}
        {tab === 'receive' && (
          <>
            {/* branch staff selector strip */}
            <div style={{
              padding: '8px 12px',
              borderBottom: '1.5px solid var(--line)',
              background: 'var(--paper-dark)',
              display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                พนักงานสาขา:
              </span>
              {BRANCH_STAFF.map(s => {
                const active = branchStaff?.code === s.code;
                return (
                  <button key={s.code} onClick={() => setBranchStaff(active ? null : s)} style={{
                    padding: '5px 14px',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 999,
                    background: active ? 'var(--accent)' : 'white',
                    color: active ? 'white' : 'var(--ink)',
                    fontFamily: 'Patrick Hand', fontSize: 15,
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                    boxShadow: active ? '2px 2px 0 var(--line)' : '1px 1px 0 var(--line)',
                  }}>
                    {s.name}
                  </button>
                );
              })}
            </div>

            {/* receive content */}
            {branchStaff ? (
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <BranchReceive
                  {...screenProps}
                  setTab={() => {}}
                  branchStaff={branchStaff}
                  setBranchStaff={setBranchStaff}
                />
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
              }}>
                <div style={{ fontSize: 52 }}>👆</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', textAlign: 'center' }}>
                  กดปุ่มชื่อพนักงานด้านบนเพื่อเริ่มรับสินค้า
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* bottom tab bar */}
      <div style={{
        display: 'flex', flexShrink: 0,
        height: 56,
        borderTop: '2px solid var(--line)',
        background: 'var(--paper-dark)',
      }}>
        {[
          { k: 'pack',    label: '📦 แพ็คกิ้ง' },
          { k: 'receive', label: '📥 รับสินค้า' },
        ].map(t => (
          <button key={t.k} onClick={() => setAndroidTab(t.k)} style={{
            flex: 1,
            border: 'none',
            borderTop: `3px solid ${tab === t.k ? 'var(--accent)' : 'transparent'}`,
            background: tab === t.k ? 'var(--accent-soft)' : 'transparent',
            fontFamily: 'Patrick Hand', fontSize: 17,
            color: tab === t.k ? 'var(--accent)' : 'var(--mute)',
            cursor: 'pointer',
            fontWeight: tab === t.k ? 700 : 400,
            transition: 'all 0.1s',
          }}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
