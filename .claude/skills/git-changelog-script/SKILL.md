---
name: git-changelog-script
description: Use when running or modifying git_changelog_pdf.py, the changelog-to-PDF generator script for this repo.
---

# Utility Script — `git_changelog_pdf.py`

สร้างไฟล์ `changelog.pdf` สรุปประวัติ Git Commit ทั้งหมดในโปรเจกต์

```bash
pip install reportlab   # ติดตั้งครั้งแรกเท่านั้น
python git_changelog_pdf.py
```

ตั้งค่าในไฟล์:
| ค่า | default | คำอธิบาย |
|---|---|---|
| `AUTHOR_FILTER` | `""` | กรองเฉพาะผู้แก้ไขคนนั้น — ว่างเปล่า = ทุกคน |
| `DATE_AFTER` | `""` | ดูตั้งแต่วันที่นี้ เช่น `"2026-01-01"` — ว่างเปล่า = ทั้งหมด |
| `PROJECT_NAME` | `"PROJECT WAREHOUSE INBOUND &"` | ชื่อโปรเจกต์บน PDF |
| `OUTPUT_FILE` | `"changelog.pdf"` | ชื่อไฟล์ output |

ตาราง PDF มีคอลัมน์: `#` / วันที่-เวลา / ผู้แก้ไข / รายละเอียด (commit message) / Commit hash (7 ตัว)
