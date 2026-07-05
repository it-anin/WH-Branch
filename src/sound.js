// เสียงสแกนสำเร็จ — สังเคราะห์สดด้วย Web Audio API (ไม่ใช้ไฟล์เสียง) แบบ "Success Chime"
// เลือกจาก scan-sounds.html (gallery ตัวอย่าง 8 แบบ) — สองโน้ตไล่ขึ้น C6 → E6
// เล่นทุกครั้งที่สแกนสำเร็จ 1 ชิ้น ไม่ว่าจะครบจำนวนหรือไม่
//
// playBoxScan — เสียงสแกน "บาร์โค้ดลัง" สำเร็จ (Android BranchReceive, ก่อนเข้าตรวจนับสินค้า)
// เลือกจาก receive-scan-sound-preview.html (gallery 10 แบบ) — คอร์ดไล่ขึ้น C5-E5-G5 (Major Triad)
// แยกโทนจาก playScanSuccess (สแกนสินค้าทีละชิ้น) ตั้งใจให้ฟังต่างกันชัดเจน
//
// playScanFail — เสียงสแกน "ไม่ผ่าน" (Android BranchReceive ฝั่งสาขา)
// เลือกจาก receive-fail-sound-preview.html (gallery 10 แบบ) — บัซเซอร์หยาบ (sawtooth, โทนต่ำ)
// ใช้กับ: สแกนบาร์โค้ดลังไม่ติดทุกกรณี (ไม่เจอลัง/ผิดสาขา/รับแล้ว/แจ้งปัญหา/รออนุมัติ/ถูกล็อก) + สแกนสินค้าไม่พบ SKU ในลัง
let audioCtx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(ctx, freq, startOffset, dur, peakVol, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakVol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playScanSuccess() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tone(ctx, 1046, 0, 0.08, 0.28);    // C6
    tone(ctx, 1318, 0.07, 0.15, 0.28); // E6
  } catch {
    // เบราว์เซอร์ไม่รองรับ Web Audio API — ข้ามเงียบๆ ไม่กระทบการสแกน
  }
}

export function playBoxScan() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tone(ctx, 523, 0, 0.10, 0.26);     // C5
    tone(ctx, 659, 0.05, 0.10, 0.26);  // E5
    tone(ctx, 784, 0.10, 0.20, 0.30);  // G5
  } catch {
    // เบราว์เซอร์ไม่รองรับ Web Audio API — ข้ามเงียบๆ ไม่กระทบการสแกน
  }
}

export function playScanFail() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tone(ctx, 150, 0, 0.20, 0.22, 'sawtooth');
  } catch {
    // เบราว์เซอร์ไม่รองรับ Web Audio API — ข้ามเงียบๆ ไม่กระทบการสแกน
  }
}
