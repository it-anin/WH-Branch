"""
git_changelog_pdf.py
--------------------
รันสคริปต์นี้ในโฟลเดอร์โปรเจกต์ที่ใช้ Git
จะสร้างไฟล์ changelog.pdf สรุปประวัติการแก้ไขทั้งหมด

วิธีใช้:
    python git_changelog_pdf.py

ตัวเลือก (แก้ไขค่าด้านล่างได้):
    AUTHOR_FILTER  = "ชื่อของคุณ"  หรือ "" เพื่อดูทุกคน
    DATE_AFTER     = "2026-01-01"   หรือ "" เพื่อดูทั้งหมด
    PROJECT_NAME   = "ชื่อโปรเจกต์"
"""

import subprocess
import sys
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

# ========== ตั้งค่าตรงนี้ ==========
AUTHOR_FILTER = ""          # ใส่ชื่อเพื่อกรองเฉพาะคนนั้น เช่น "somchai"
DATE_AFTER    = ""          # ใส่วันที่เริ่มต้น เช่น "2026-01-01"
PROJECT_NAME  = "PROJECT WAREHOUSE INBOUND &"
OUTPUT_FILE   = "changelog.pdf"
# ====================================


def get_git_log():
    """ดึงประวัติ Git Commit"""
    cmd = [
        "git", "log",
        "--pretty=format:%H|%ad|%an|%s",
        "--date=format:%d/%m/%Y %H:%M"
    ]
    if AUTHOR_FILTER:
        cmd += [f"--author={AUTHOR_FILTER}"]
    if DATE_AFTER:
        cmd += [f"--after={DATE_AFTER}"]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        output = result.stdout.decode("utf-8", errors="replace")
        lines = output.strip().split("\n")
        commits = []
        for line in lines:
            if "|" in line:
                parts = line.split("|", 3)
                if len(parts) == 4:
                    commits.append({
                        "hash":    parts[0][:7],
                        "date":    parts[1],
                        "author":  parts[2],
                        "message": parts[3]
                    })
        return commits
    except subprocess.CalledProcessError:
        print("❌ ไม่พบ Git Repository ในโฟลเดอร์นี้")
        sys.exit(1)


def get_repo_name():
    """ดึงชื่อ Repository"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip().split("/")[-1]
    except Exception:
        return PROJECT_NAME


def build_pdf(commits, repo_name):
    """สร้างไฟล์ PDF"""
    doc = SimpleDocTemplate(
        OUTPUT_FILE,
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm,   bottomMargin=2*cm
    )

    styles = getSampleStyleSheet()

    # สไตล์ตัวอักษร
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=20, textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=11, textColor=colors.HexColor("#555555"),
        spaceAfter=2
    )
    header_style = ParagraphStyle(
        "Header", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#888888")
    )
    msg_style = ParagraphStyle(
        "Msg", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#1a1a2e"),
        leading=14
    )
    meta_style = ParagraphStyle(
        "Meta", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#777777")
    )

    story = []

    # ===== หัวรายงาน =====
    story.append(Paragraph(f"บันทึกการแก้ไข", title_style))
    story.append(Paragraph(f"โปรเจกต์: {repo_name}", subtitle_style))

    # ข้อมูลรายงาน
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    filter_info = f"ผู้แก้ไข: {AUTHOR_FILTER or 'ทั้งหมด'}  |  ตั้งแต่: {DATE_AFTER or 'ทั้งหมด'}"
    story.append(Paragraph(f"สร้างเมื่อ: {now}  |  {filter_info}", header_style))
    story.append(Paragraph(f"จำนวน Commit ทั้งหมด: {len(commits)} รายการ", header_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#4361ee")))
    story.append(Spacer(1, 0.4*cm))

    if not commits:
        story.append(Paragraph("ไม่พบประวัติการแก้ไข", styles["Normal"]))
        doc.build(story)
        return

    # ===== ตารางประวัติ =====
    table_data = [
        [
            Paragraph("<b>#</b>",        meta_style),
            Paragraph("<b>วันที่/เวลา</b>", meta_style),
            Paragraph("<b>ผู้แก้ไข</b>",   meta_style),
            Paragraph("<b>รายละเอียด</b>", meta_style),
            Paragraph("<b>Commit</b>",    meta_style),
        ]
    ]

    for i, c in enumerate(commits, 1):
        table_data.append([
            Paragraph(str(i), meta_style),
            Paragraph(c["date"], meta_style),
            Paragraph(c["author"], meta_style),
            Paragraph(c["message"], msg_style),
            Paragraph(c["hash"], meta_style),
        ])

    col_widths = [1*cm, 3.5*cm, 3*cm, 8*cm, 1.5*cm]

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        # หัวตาราง
        ("BACKGROUND",  (0, 0), (-1, 0),  colors.HexColor("#4361ee")),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
        ("FONTSIZE",    (0, 0), (-1, 0),  9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING",    (0, 0), (-1, 0), 8),
        # แถวข้อมูล
        ("FONTSIZE",    (0, 1), (-1, -1), 9),
        ("TOPPADDING",  (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
            [colors.white, colors.HexColor("#f0f4ff")]),
        # เส้นขอบ
        ("GRID",        (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("ALIGN",       (0, 0), (0, -1),  "CENTER"),
        ("ALIGN",       (4, 0), (4, -1),  "CENTER"),
    ]))

    story.append(table)

    # ===== ท้ายหน้า =====
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        f"รายงานนี้สร้างโดยอัตโนมัติจาก Git History  |  {now}",
        meta_style
    ))

    doc.build(story)


def main():
    print("📋 กำลังดึงประวัติ Git...")
    commits = get_git_log()
    repo_name = get_repo_name()

    print(f"✅ พบ {len(commits)} commits จาก repository: {repo_name}")
    print("📄 กำลังสร้าง PDF...")

    build_pdf(commits, repo_name)

    print(f"✅ สร้างไฟล์สำเร็จ: {OUTPUT_FILE}")
    print(f"   ไฟล์อยู่ที่: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
