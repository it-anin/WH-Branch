import { useState } from 'react';
import PackScanC from './PackScanC.jsx';
import BranchReceive from './BranchReceive.jsx';
import { BRANCHES, getBranch } from '../branches.js';

// WAREHOUSE = คลังสินค้า (แพ็คกิ้งเท่านั้น) — ไม่อยู่ใน BRANCHES เพราะไม่มี staff รับสินค้า + ไม่กระทบ desktop filter
const WAREHOUSE = { code: 'WAREHOUSE', name: 'WAREHOUSE', warehouse: true };
const resolveLoc = (code) => code === 'WAREHOUSE' ? WAREHOUSE : getBranch(code);

// สไตล์ปุ่มการ์ดใหญ่ (หน้าเลือกที่ทำงาน / เลือกพนักงาน)
const cardBtn = {
  padding: '9px 16px',
  border: '2px solid var(--line)',
  borderRadius: 14,
  background: 'white',
  boxShadow: '2px 2px 0 var(--line)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
};
// container เต็มจอ — ปุ่มถูกย่อให้พอดีจอ 800×480 (ไม่ต้องเลื่อน); overflow auto เหลือไว้เป็น fallback กันพนักงานเยอะผิดปกติ
const fullScreen = {
  position: 'fixed', inset: 0,
  overflowY: 'auto',
  background: 'var(--paper)',
  display: 'flex', flexDirection: 'column',
};
// กล่องเนื้อหา — margin:auto จัดกึ่งกลาง; ถ้าสูงเกินจอจริง ๆ จะ scroll ได้ (ไม่ตัดด้านบนแบบ justify-center)
const pickerInner = {
  margin: 'auto',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', gap: 10, padding: '14px 24px',
  width: '100%', boxSizing: 'border-box',
};

export default function AndroidApp({
  screenProps,
  packer, setPacker, PACKERS, catalogByPacker,
  onScanProgress, catalogMeta,
}) {
  const [branch, setBranch] = useState(() => resolveLoc(localStorage.getItem('wh_branch')));
  const [branchStaff, setBranchStaff] = useState(null);
  const packCatalog = packer ? (catalogByPacker[packer.code] || screenProps.catalog) : screenProps.catalog;
  const isWarehouse = branch?.warehouse === true;

  // staff ขึ้นกับโหมด: WAREHOUSE → packers (lifted ที่ App.jsx), สาขา → branch.staff (local)
  const staffList    = isWarehouse ? PACKERS : (branch?.staff || []);
  const currentStaff = isWarehouse ? packer : branchStaff;
  const setStaff     = isWarehouse ? setPacker : setBranchStaff;

  // เลือกที่ทำงาน → ล้างพนักงานทั้ง 2 โหมดเสมอ → ไปหน้าเลือกพนักงาน
  function selectBranch(b) {
    setBranch(b);
    setBranchStaff(null);
    setPacker(null);
    localStorage.setItem('wh_branch', b.code);
  }
  // กลับไปหน้าเลือกที่ทำงาน
  function changeBranch() {
    setBranch(null);
    setBranchStaff(null);
    setPacker(null);
    localStorage.removeItem('wh_branch');
  }

  // ── ขั้นที่ 1: เลือกที่ทำงาน ──
  if (!branch) {
    return (
      <div style={fullScreen}>
        <div style={pickerInner}>
        <div style={{ fontSize: 34 }}>📍</div>
        <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
          เลือกที่ทำงาน
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
          {/* WAREHOUSE — แพ็คกิ้ง */}
          <button className="loc-btn" onClick={() => selectBranch(WAREHOUSE)}
            style={{ ...cardBtn, border: '2px solid var(--accent)', background: 'var(--accent-soft)' }}>
            <span style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
              📦 WAREHOUSE
            </span>
            <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--accent)' }}>
              แพ็คกิ้ง
            </span>
          </button>

          <div style={{ height: 1, background: 'var(--line)', opacity: 0.5, margin: '2px 0' }} />

          {/* สาขา — รับสินค้า */}
          {BRANCHES.map((b, i) => (
            <button key={b.code} className="loc-btn" onClick={() => selectBranch(b)}
              style={{ ...cardBtn, animationDelay: `${(i + 1) * 70}ms` }}>
              <span style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                {b.name}
              </span>
              <span style={{ fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)' }}>
                รับสินค้า · {b.staff.length} คน
              </span>
            </button>
          ))}
        </div>
        </div>
      </div>
    );
  }

  // ── ขั้นที่ 2: เลือกพนักงาน (ก่อนเข้าหน้าสแกน) ──
  if (!currentStaff) {
    return (
      <div style={fullScreen}>
        <div style={pickerInner}>
        <div style={{ fontSize: 34 }}>👤</div>
        <div style={{ fontFamily: 'system-ui', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
          เลือกพนักงาน
        </div>
        <div style={{
          fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, color: 'var(--accent)',
          background: 'var(--accent-soft)', padding: '3px 12px', borderRadius: 999,
        }}>
          {isWarehouse ? '📦 WAREHOUSE · แพ็คกิ้ง' : `🏢 สาขา ${branch.name} · รับสินค้า`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320, marginTop: 0 }}>
          {staffList.map((s, i) => (
            <button key={s.code} className="loc-btn" onClick={() => setStaff(s)}
              style={{ ...cardBtn, animationDelay: `${i * 60}ms` }}>
              <span style={{ fontFamily: 'system-ui', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                {s.name}
              </span>
              {s.role === 'pharmacist' && (
                <span style={{
                  fontFamily: 'system-ui', fontSize: 12, fontWeight: 700, color: 'white',
                  background: 'var(--accent)', padding: '2px 10px', borderRadius: 999,
                }}>
                  💊 เภสัช
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={changeBranch} style={{
          marginTop: 4,
          padding: '6px 16px',
          border: '1.5px solid var(--line)', borderRadius: 999, background: 'white',
          fontFamily: 'system-ui', fontSize: 13, color: 'var(--mute)', cursor: 'pointer',
        }}>
          ← เปลี่ยนที่ทำงาน
        </button>
        </div>
      </div>
    );
  }

  // ── ขั้นที่ 3: หน้าสแกน ──
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
      overflow: 'hidden',
    }}>

      {/* header: ที่ทำงาน + พนักงาน + ปุ่มเปลี่ยนพนักงาน */}
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
        <span style={{ color: 'var(--mute)', fontSize: 13 }}>·</span>
        <span style={{ fontFamily: 'system-ui', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
          👤 {currentStaff.name}
        </span>
        <button onClick={() => setStaff(null)} style={{
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

      {/* content: หน้าสแกน (staff ถูกเลือกแล้วเสมอ) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {isWarehouse ? (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
            <PackScanC
              key={`${packer.code}-${packCatalog.length}`}
              {...screenProps}
              catalog={packCatalog}
              packer={packer}
              setTab={() => {}}
              onScanProgress={onScanProgress}
              catalogMeta={catalogMeta}
            />
          </div>
        ) : (
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
        )}
      </div>

      {/* bottom bar: ป้ายโหมด (แพ็คกิ้ง/รับสินค้า) */}
      <div style={{
        display: 'flex', flexShrink: 0,
        height: 56,
        borderTop: '2px solid var(--line)',
        background: 'var(--paper-dark)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'system-ui', fontSize: 17, fontWeight: 700, color: 'var(--accent)',
        }}>
          {isWarehouse ? '📦 แพ็คกิ้ง' : '📥 รับสินค้า'}
        </span>
      </div>
    </div>
  );
}
