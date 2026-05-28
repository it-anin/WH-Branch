import { useState } from 'react';

function extractZone(location) {
  if (!location) return null;
  const m = location.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : null;
}

export default function ZoneAssign({ catalog, packers, zoneAssignments, onSave, onClose }) {
  const zones = [...new Set(catalog.map(item => extractZone(item.location)).filter(Boolean))].sort();

  const [assignments, setAssignments] = useState(() => {
    const init = {};
    packers.forEach(p => { init[p.code] = zoneAssignments[p.code] || []; });
    return init;
  });

  function toggle(packerCode, zone) {
    setAssignments(prev => {
      const cur = prev[packerCode] || [];
      const next = cur.includes(zone) ? cur.filter(z => z !== zone) : [...cur, zone].sort();
      return { ...prev, [packerCode]: next };
    });
  }

  function countItems(packerCode) {
    const assigned = assignments[packerCode] || [];
    if (assigned.length === 0) return 0;
    return catalog.filter(item => assigned.includes(extractZone(item.location))).length;
  }

  const totalAssigned = packers.reduce((sum, p) => sum + countItems(p.code), 0);
  const unassigned = catalog.length - totalAssigned;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <b style={{ fontSize: 16 }}>กำหนดโซน</b>
          <button className="btn sm" onClick={onClose}>× ปิด</button>
        </div>

        {zones.length === 0 ? (
          <p style={{ color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>
            ยังไม่มีข้อมูล Location — กรุณาอัปโหลดไฟล์ Picklist ก่อน
          </p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--line)', fontWeight: 600 }}>พนักงาน</th>
                  {zones.map(z => (
                    <th key={z} style={{ padding: '8px 10px', borderBottom: '2px solid var(--line)', textAlign: 'center', minWidth: 44, fontWeight: 600 }}>{z}</th>
                  ))}
                  <th style={{ padding: '8px 10px', borderBottom: '2px solid var(--line)', textAlign: 'center', color: 'var(--mute)', fontSize: 12, fontWeight: 400 }}>SKU</th>
                </tr>
              </thead>
              <tbody>
                {packers.map(p => (
                  <tr key={p.code}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>{p.name}</td>
                    {zones.map(z => (
                      <td key={z} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={(assignments[p.code] || []).includes(z)}
                          onChange={() => toggle(p.code, z)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {countItems(p.code) > 0
                        ? <span className="chip ok" style={{ fontSize: 12 }}>{countItems(p.code)}</span>
                        : <span style={{ color: 'var(--mute)' }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {unassigned > 0 && (
              <p style={{ marginTop: 12, fontSize: 12, color: '#c87000' }}>
                ⚠ {unassigned} SKU ไม่ได้อยู่ในโซนที่กำหนด (จะไม่ปรากฏในรายการของพนักงานคนใด)
              </p>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={onClose}>ยกเลิก</button>
              <button className="btn sm primary" onClick={() => { onSave(assignments); onClose(); }}>
                บันทึก
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
