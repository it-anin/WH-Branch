const ERROR_COPY = {
  'resource-exhausted': {
    tone: 'error',
    title: 'Firestore เกินโควต้ารายวัน',
    message: 'ระบบอาจอ่านหรือบันทึกข้อมูลไม่ได้ กรุณาหยุดทำรายการและติดต่อผู้ดูแลระบบ',
  },
  'permission-denied': {
    tone: 'error',
    title: 'ไม่มีสิทธิ์ใช้งาน Firestore',
    message: 'ระบบไม่ได้รับอนุญาตให้อ่านหรือบันทึกข้อมูล กรุณาติดต่อผู้ดูแลระบบ',
  },
  unauthenticated: {
    tone: 'error',
    title: 'การเข้าสู่ระบบ Firestore หมดอายุ',
    message: 'กรุณาเปิดโปรแกรมใหม่หรือเข้าสู่ระบบอีกครั้งก่อนทำรายการต่อ',
  },
  unavailable: {
    tone: 'warn',
    title: 'เชื่อมต่อ Firestore ไม่ได้',
    message: 'กรุณาตรวจอินเทอร์เน็ต ข้อมูลที่ยังไม่บันทึกจะคงอยู่บนหน้าจอเพื่อให้ลองใหม่',
  },
};

export const FIRESTORE_ALERT_COLORS = Object.freeze({
  error: {
    background: '#8f1d14',
    border: '#5f110b',
    color: '#fff',
  },
  warn: {
    background: '#fff0d8',
    border: '#c66a00',
    color: '#6b3600',
  },
});

export function normalizeFirestoreErrorCode(error) {
  const raw = String(error?.code || error?.message || 'unknown').trim().toLowerCase();
  const code = raw.replace(/^firestore\//, '');
  if (code === 'auth/network-request-failed' || code === 'network-request-failed') return 'unavailable';
  return code;
}

export function classifyFirestoreError(error, {
  source = 'Firestore',
  critical = true,
} = {}) {
  const code = normalizeFirestoreErrorCode(error);
  const copy = ERROR_COPY[code] || {
    tone: critical ? 'error' : 'warn',
    title: 'Firestore ขัดข้อง',
    message: 'ระบบทำรายการไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ',
  };
  const progressOnly = !critical && source === 'progress';

  return {
    code,
    source,
    critical,
    blocking: critical && code !== 'unavailable',
    tone: progressOnly ? 'warn' : copy.tone,
    title: progressOnly ? 'Dashboard อัปเดตความคืบหน้าไม่ได้' : copy.title,
    message: progressOnly
      ? 'ข้อมูลลังหลักยังทำงานต่อได้ แต่ความคืบหน้าบน Dashboard อาจไม่เป็นปัจจุบัน'
      : copy.message,
    detail: String(error?.message || ''),
    detectedAt: Date.now(),
  };
}
