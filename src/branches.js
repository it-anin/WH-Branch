// สาขา + พนักงานประจำสาขา (ใช้ร่วมกันระหว่าง AndroidApp.jsx และ BranchReceive.jsx)
// code ของสาขา = suffix ของไฟล์ Picklist (Picklist_SRC → 'SRC') → ตรงกับ catalogMeta.branch / box.branch
// staff[].role === 'pharmacist' = สิทธิ์ recheck ลังที่แจ้งปัญหา (Pharmacist Recheck Flow)
export const BRANCHES = [
  {
    code: 'SRC',
    name: 'SRC',
    staff: [
      { code: 'SRC-01', name: 'ก้า' },
      { code: 'SRC-02', name: 'กิ๊ฟ' },
      { code: 'SRC-03', name: 'สุ่ย' },
      { code: 'SRC-04', name: 'นิคกี้' },
      { code: 'SRC-09', name: 'อ๊อฟ', role: 'pharmacist' },  // เภสัช
    ],
  },
  {
    code: 'KKL',
    name: 'KKL',
    staff: [
      { code: 'KKL-01', name: 'แตงโม' },
      { code: 'KKL-02', name: 'ทราย' },
      { code: 'KKL-09', name: 'ออด', role: 'pharmacist' },  // เภสัช
    ],
  },
  {
    code: 'SSS',
    name: 'SSS',
    staff: [
      { code: 'SSS-01', name: 'ออย' },
      { code: 'SSS-02', name: 'ฟ้าใส' },
      { code: 'SSS-09', name: 'เบส', role: 'pharmacist' },  // เภสัช
    ],
  },
];

// รวมพนักงานทุกสาขา (พ่วง branch code) — ใช้ใน Desktop staff filter dropdown
export const ALL_BRANCH_STAFF = BRANCHES.flatMap(b =>
  b.staff.map(s => ({ ...s, branch: b.code }))
);

export const getBranch = (code) => BRANCHES.find(b => b.code === code) || null;
