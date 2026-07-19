import { useState } from 'react';
// zoneOfItem = แหล่งเดียวของ logic โซน (ตรงกับ computeCatalogByPacker ใน App.jsx เสมอ)
import { zoneOfItem, NOLOC_ZONE } from '../units.js';
import {
  assignZoneExclusively,
  computeCatalogByPacker,
  normalizeExclusiveZoneAssignments,
} from '../warehouseHelpers.js';

// label ของโซนพิเศษ "ไม่มี location" (Picklist เบิกด่วน) — ตัวโซนจริงใช้ชื่อดิบ
const zoneLabel = (z) => z === NOLOC_ZONE ? '📌 เบิกด่วน' : z;

export default function ZoneAssign({ catalog, packers, zoneAssignments, onSave, onClose }) {
  // โซนจริงจาก catalog + บังคับมีคอลัมน์ 📌เบิกด่วน ท้ายสุดเสมอ — tick ล่วงหน้าได้ก่อน Picklist เบิกด่วนจะมา
  // + โซนค้างที่บันทึกไว้แต่ไม่อยู่ใน Picklist วันนี้ (เช่น M/OFF/S/COOL จากรอบก่อน) ต้องโชว์เป็นคอลัมน์ด้วย —
  //   เดิมสร้างคอลัมน์จาก catalog อย่างเดียว ติ๊กค้างเลย "ล่องหน" แกะออกไม่ได้: คำเตือนปนโซนเด้งทั้งที่เห็นติ๊กเดียว
  //   และเคยทำพนักงานได้รายการเบิก 0 (assignments เหลือแต่โซนที่ไม่มีของ) — ห้าม auto-prune ตอนบันทึก
  //   เพราะโซนจริงที่แค่วันนี้ไม่มีของ (COOL/S) อาจกลับมาพรุ่งนี้ ให้คนเห็นแล้วตัดสินใจแกะเอง
  const currentZones = new Set(catalog.map(zoneOfItem)); // โซนที่มีของจริงวันนี้ — นอกเซ็ตนี้ = โซนค้าง (หัวคอลัมน์สีเทา)
  const zones = [
    ...[...new Set([
      ...currentZones,
      ...packers.flatMap(p => zoneAssignments[p.code] || []),
    ])]
      .filter(z => z !== NOLOC_ZONE)
      .sort((a, b) => a.length !== b.length ? a.length - b.length : a.localeCompare(b)),
    NOLOC_ZONE,
  ];

  const [assignments, setAssignments] = useState(() => {
    const init = {};
    packers.forEach(p => { init[p.code] = zoneAssignments[p.code] || []; });
    return init;
  });
  const [saveError, setSaveError] = useState('');

  function toggle(packerCode, zone) {
    setSaveError('');
    setAssignments(prev => assignZoneExclusively(
      prev,
      packerCode,
      zone,
      !(prev[packerCode] || []).includes(zone),
    ));
  }

  const distributed = computeCatalogByPacker(catalog, assignments, packers);
  function countItems(packerCode) {
    return distributed[packerCode]?.length || 0;
  }

  const totalAssigned = packers.reduce((sum, p) => sum + countItems(p.code), 0);
  const unassigned = catalog.length - totalAssigned;
  // tick 📌เบิกด่วน ปนกับโซนปกติ = เสี่ยงลังได้สาขาผิด — เบิกด่วนอาจคนละสาขากับ Picklist ปกติ
  // (createNewBox ใช้สาขาจากรายการที่พนักงานถือ ถ้าปน 2 สาขาจะ fallback สาขาปกติ → ลังเบิกด่วนสาขาผิด)
  const mixedNoloc = packers.filter(p => {
    const a = assignments[p.code] || [];
    return a.includes(NOLOC_ZONE) && a.length > 1;
  });
  // ตรวจ assignment เก่าที่เคย tick 📌เบิกด่วนซ้ำหลายคน — toggle ใหม่เป็น exclusive แล้ว
  // และตอนบันทึกจะ normalize ให้พนักงานลำดับแรกเป็นเจ้าของเพียงคนเดียว
  const multiUrgent = packers.filter(p => (assignments[p.code] || []).includes(NOLOC_ZONE));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, minWidth: 420, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <b style={{ fontSize: 16 }}>กำหนดโซน</b>
          <button className="btn sm" onClick={onClose}>× ปิด</button>
        </div>

        {catalog.length === 0 ? (
          <p style={{ color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>
            ยังไม่มีรายการเบิก — กรุณาอัปโหลดไฟล์ Picklist ก่อน
          </p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--line)', fontWeight: 600 }}>พนักงาน</th>
                  {zones.map(z => {
                    const stale = z !== NOLOC_ZONE && !currentZones.has(z); // โซนค้าง — ไม่มีของใน Picklist วันนี้
                    return (
                      <th
                        key={z}
                        title={stale ? 'ไม่มีสินค้าโซนนี้ใน Picklist วันนี้ — ติ๊กค้างจากรอบก่อน แกะออกได้' : undefined}
                        style={{ padding: '8px 10px', borderBottom: '2px solid var(--line)', textAlign: 'center', minWidth: 44, fontWeight: 600, whiteSpace: 'nowrap', ...(stale ? { color: 'var(--mute)' } : {}) }}
                      >{zoneLabel(z)}</th>
                    );
                  })}
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
            {mixedNoloc.length > 0 && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
                ⚠ {mixedNoloc.map(p => p.name).join(', ')} ถูก tick 📌เบิกด่วน ปนกับโซนปกติ —
                ถ้าเบิกด่วนเป็นคนละสาขา ลังของคนนี้จะได้สาขาผิด ควรแยกคนแพ็คเบิกด่วนไว้คนเดียว
              </p>
            )}
            {multiUrgent.length > 1 && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
                ⚠ {multiUrgent.map(p => p.name).join(', ')} ถูก tick 📌เบิกด่วน พร้อมกัน —
                เป็นค่าซ้ำจากข้อมูลเดิม · เมื่อบันทึก ระบบจะเก็บโซนนี้ให้พนักงานลำดับแรกเพียงคนเดียว
              </p>
            )}
            {saveError && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
                {saveError}
              </p>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={onClose}>ยกเลิก</button>
              <button className="btn sm primary" onClick={() => {
                if (totalAssigned === 0) {
                  setSaveError('⚠ กรุณากำหนดอย่างน้อย 1 โซนที่มีสินค้าให้พนักงานก่อนบันทึก');
                  return;
                }
                onSave(normalizeExclusiveZoneAssignments(assignments, packers));
                onClose();
              }}>
                บันทึก
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
