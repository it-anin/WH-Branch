import { catalogPackStatus } from '../units.js';

// Popup 📋 ดูรายการ Picklist (desktop, tab รายการเบิกสินค้า) — ตารางตามคอลัมน์ไฟล์จริง
// A=NO / B=SKU / C=BARCODE / D=NAME / E=UNIT / F=Quantity / G=Location / H=ABC
// แถวที่ถูกแพ็คลง "ลังที่ปิดแล้ว" ครบจำนวน (รวมทุกพนักงาน — catalogPackStatus) → พื้นเขียว + ✓ ท้ายแถว
// เห็นทั้ง Picklist ปกติและเบิกด่วน (append) ใน list เดียว — แถวเบิกด่วนมี chip 📌{สาขา}
// โครง overlay ตาม pattern ZoneAssign (render ที่ root App.jsx — ไม่โดน stacking context บัง)
export default function PicklistView({ catalog, boxes, itemsByBox, factorMap, onClose }) {
  // คำนวณใหม่ทุก render — boxes/itemsByBox มาจาก onSnapshot → ติ๊กขึ้นเรียลไทม์ขณะ popup เปิดค้าง
  const status = catalogPackStatus({ catalog, boxes, itemsByBox, factorMap });
  const doneCount = status.filter(s => s.done).length;
  const urgentCount = catalog.filter(it => it.branch).length;

  const th = { padding: '8px 10px', borderBottom: '2px solid var(--line)', textAlign: 'left', fontWeight: 600, fontSize: 13, background: 'var(--paper-dark)', whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', borderBottom: '1px solid var(--line)', fontSize: 13, verticalAlign: 'top' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#ffffff', borderRadius: 12, padding: 20, minWidth: 720, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>📋 รายการ Picklist</b>
          {catalog.length > 0 && (
            <span className="chip ok" style={{ fontSize: 12 }}>✓ แพ็คครบ {doneCount} / {catalog.length} รายการ</span>
          )}
          {urgentCount > 0 && (
            <span className="chip warn" style={{ fontSize: 12 }}>📌 เบิกด่วน {urgentCount} รายการ</span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={onClose}>× ปิด</button>
        </div>

        {catalog.length === 0 ? (
          <p style={{ color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>
            ยังไม่มีรายการเบิก — กรุณาอัปโหลดไฟล์ Picklist ก่อน
          </p>
        ) : (
          <div style={{ border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'auto', flex: 1, minHeight: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ ...th, textAlign: 'right', width: 44 }}>NO</th>
                  <th style={th}>SKU</th>
                  <th style={th}>BARCODE</th>
                  <th style={th}>ชื่อสินค้า</th>
                  <th style={th}>หน่วย</th>
                  <th style={{ ...th, textAlign: 'right' }}>จำนวน</th>
                  <th style={th}>Location</th>
                  <th style={{ ...th, textAlign: 'center' }}>ABC</th>
                  <th style={{ ...th, textAlign: 'center', width: 44 }}>✓</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((it, idx) => {
                  const done = status[idx]?.done;
                  return (
                    <tr key={idx} style={{ background: done ? '#e8f0d8' : 'white' }}>
                      {/* fallback รายการที่ import ก่อนมี field ใหม่: no → เลขลำดับ, rawBarcode → barcode (merge แล้ว), abc → — */}
                      <td style={{ ...td, textAlign: 'right', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{it.no || idx + 1}</td>
                      <td className="mono" style={{ ...td, fontSize: 12 }}>{it.sku}</td>
                      <td className="mono" style={{ ...td, fontSize: 11, color: 'var(--mute)', wordBreak: 'break-all', maxWidth: 150 }}>{it.rawBarcode ?? it.barcode}</td>
                      <td style={{ ...td, fontFamily: 'system-ui', maxWidth: 300, wordBreak: 'break-word' }}>
                        {it.name}
                        {it.branch && (
                          <span className="mono" style={{ fontSize: 10, background: 'var(--paper-dark)', border: '1px solid var(--line)', borderRadius: 3, padding: '0 4px', marginLeft: 6, whiteSpace: 'nowrap' }}>📌{it.branch}</span>
                        )}
                      </td>
                      <td style={{ ...td, fontFamily: 'system-ui', whiteSpace: 'nowrap' }}>{it.unit}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{it.qty}</td>
                      <td className="mono" style={{ ...td, fontSize: 12 }}>{it.location || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{it.abc || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {done && (
                          <span style={{
                            display: 'inline-flex', width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--green)', color: 'white',
                            alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                          }}>✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
