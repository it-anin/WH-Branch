import { useState } from 'react';
import PackScanC from './PackScanC.jsx';
import BranchReceive from './BranchReceive.jsx';
import { BRANCHES, getBranch } from '../branches.js';

// WAREHOUSE = คลังสินค้า (แพ็คกิ้งเท่านั้น) — ไม่อยู่ใน BRANCHES เพราะไม่มี staff รับสินค้า + ไม่กระทบ desktop filter
const WAREHOUSE = { code: 'WAREHOUSE', name: 'WAREHOUSE', warehouse: true };
const resolveLoc = (code) => code === 'WAREHOUSE' ? WAREHOUSE : getBranch(code);

export default function AndroidApp({
  screenProps,
  packer, setPacker, PACKERS, catalogByPacker,
  onScanProgress, catalogMeta,
}) {
  const [branch, setBranch] = useState(() => resolveLoc(localStorage.getItem('wh_branch')));
  // WAREHOUSE → แพ็คกิ้ง, สาขา → รับสินค้า (แต่ละโหมดมีแท็บเดียว)
  const [tab, setAndroidTab] = useState(() => branch && !branch.warehouse ? 'receive' : 'pack');
  const [branchStaff, setBranchStaff] = useState(null);
  const packCatalog = packer ? (catalogByPacker[packer.code] || screenProps.catalog) : screenProps.catalog;
  const isWarehouse = branch?.warehouse === true;
  const availableTabs = isWarehouse
    ? [{ k: 'pack', label: '📦 แพ็คกิ้ง' }]
    : [{ k: 'receive', label: '📥 รับสินค้า' }];

  function selectBranch(b) {
    setBranch(b);
    setBranchStaff(null);   // คนละสาขา = คนละพนักงาน
    setAndroidTab(b.warehouse ? 'pack' : 'receive');
    localStorage.setItem('wh_branch', b.code);
  }
  function changeBranch() {
    setBranch(null);
    setBranchStaff(null);
    localStorage.removeItem('wh_branch');
  }

  // ── หน้าแรก: เลือกสาขา (ก่อนเข้าใช้งาน) ──
  if (!branch) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
        background: 'var(--paper)',
      }}>
        <div style={{ fontSize: 52 }}>📍</div>
        <div style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
          เลือกที่ทำงาน
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
          {/* WAREHOUSE — แพ็คกิ้ง */}
          <button onClick={() => selectBranch(WAREHOUSE)} style={{
            padding: '16px 20px',
            border: '2px solid var(--accent)',
            borderRadius: 14,
            background: 'var(--accent-soft)',
            boxShadow: '2px 2px 0 var(--line)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
              📦 WAREHOUSE
            </span>
            <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--accent)' }}>
              แพ็คกิ้ง
            </span>
          </button>

          <div style={{ height: 1, background: 'var(--line)', opacity: 0.5, margin: '2px 0' }} />

          {/* สาขา — รับสินค้า */}
          {BRANCHES.map(b => (
            <button key={b.code} onClick={() => selectBranch(b)} style={{
              padding: '16px 20px',
              border: '2px solid var(--line)',
              borderRadius: 14,
              background: 'white',
              boxShadow: '2px 2px 0 var(--line)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
                {b.name}
              </span>
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)' }}>
                รับสินค้า · {b.staff.length} คน
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
      overflow: 'hidden',
    }}>

      {/* branch header */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '2px solid var(--line)',
        background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontSize: 15 }}>{isWarehouse ? '📦' : '🏢'}</span>
        <span style={{ fontFamily: 'system-ui', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
          {isWarehouse ? 'WAREHOUSE' : `สาขา ${branch.name}`}
        </span>
        <button onClick={changeBranch} style={{
          marginLeft: 'auto',
          padding: '3px 12px',
          border: '1.5px solid var(--line)',
          borderRadius: 999,
          background: 'white',
          fontFamily: 'system-ui', fontSize: 12, color: 'var(--mute)',
          cursor: 'pointer',
        }}>
          เปลี่ยน
        </button>
      </div>

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
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
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
                    fontFamily: 'system-ui', fontSize: 15,
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
                  catalogMeta={catalogMeta}
                />
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
              }}>
                <div style={{ fontSize: 52 }}>👆</div>
                <div style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)', textAlign: 'center' }}>
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
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                พนักงาน:
              </span>
              {branch.staff.map(s => {
                const active = branchStaff?.code === s.code;
                return (
                  <button key={s.code} onClick={() => setBranchStaff(active ? null : s)} style={{
                    padding: '5px 14px',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 999,
                    background: active ? 'var(--accent)' : 'white',
                    color: active ? 'white' : 'var(--ink)',
                    fontFamily: 'system-ui', fontSize: 15,
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
                  isAndroid={true}
                  branch={branch.code}
                />
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
              }}>
                <div style={{ fontSize: 52 }}>👆</div>
                <div style={{ fontFamily: 'system-ui', fontSize: 26, fontWeight: 700, color: 'var(--ink)' }}>
                  เลือกชื่อพนักงานก่อน
                </div>
                <div style={{ fontFamily: 'system-ui', fontSize: 15, color: 'var(--mute)', textAlign: 'center' }}>
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
        {availableTabs.map(t => (
          <button key={t.k} onClick={() => setAndroidTab(t.k)} style={{
            flex: 1,
            border: 'none',
            borderTop: `3px solid ${tab === t.k ? 'var(--accent)' : 'transparent'}`,
            background: tab === t.k ? 'var(--accent-soft)' : 'transparent',
            fontFamily: 'system-ui', fontSize: 17,
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
