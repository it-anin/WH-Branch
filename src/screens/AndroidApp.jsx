import { useState } from 'react';
import PackScanC from './PackScanC.jsx';
import BranchReceive from './BranchReceive.jsx';

// location (คลัง/สาขา) มาจากโปรไฟล์ที่ login (prop) — Login แทนหน้า "เลือกที่ทำงาน" เดิมแล้ว
// สไตล์ปุ่มการ์ดใหญ่ (หน้าเลือกพนักงาน)
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
  profile, logout,
  packer, setPacker, PACKERS, catalogByPacker,
  onScanProgress, catalogMeta,
}) {
  const branch = profile; // location = โปรไฟล์ที่ login (คลัง/สาขา) — Login แทน picker ขั้นที่ 1 เดิม
  const [branchStaff, setBranchStaff] = useState(null);
  const packCatalog = packer ? (catalogByPacker[packer.code] || screenProps.catalog) : screenProps.catalog;
  const isWarehouse = branch?.warehouse === true;

  // staff ขึ้นกับโหมด: WAREHOUSE → packers (lifted ที่ App.jsx), สาขา → branch.staff (local)
  const staffList    = isWarehouse ? PACKERS : (branch?.staff || []);
  const currentStaff = isWarehouse ? packer : branchStaff;
  const setStaff     = isWarehouse ? setPacker : setBranchStaff;

  // "เปลี่ยนที่ทำงาน" = ออกจากระบบ (กลับหน้า Login) + ล้าง packer ที่ lifted (branchStaff local หายเองตอน unmount)
  function changeBranch() {
    setPacker(null);
    logout();
  }

  // ── ขั้นที่ 1 (เดิม "เลือกที่ทำงาน") ถูกแทนด้วยหน้า Login แล้ว — เข้ามาที่นี่คือ login แล้วเสมอ ──
  // ── ขั้นเลือกพนักงาน (ก่อนเข้าหน้าสแกน) ──
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
    </div>
  );
}
