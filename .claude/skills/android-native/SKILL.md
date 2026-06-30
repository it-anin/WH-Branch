---
name: android-native
description: Use when editing files under android/ (Kotlin/Gradle/manifest) — MainActivity.kt, WebView config, scanner BroadcastReceiver integration (KTE/Zebra/Honeywell/DataWedge), file-chooser/camera FileProvider setup, Play Store In-App Updates, APK build/CI, or deciding whether an APK rebuild is required for a change.
---

# Android App (`android/`)

## โครงสร้าง
```
android/
├── settings.gradle / build.gradle / gradle.properties
├── gradle/wrapper/gradle-wrapper.properties  (Gradle 8.2)
└── app/
    ├── build.gradle            compileSdk 34, minSdk 26 (Android 8+)
    └── src/main/
        ├── AndroidManifest.xml  portrait lock, NoActionBar, INTERNET permission
        ├── java/co/anin/wh/
        │   └── MainActivity.kt
        └── res/layout/activity_main.xml
```

## MainActivity.kt — สิ่งสำคัญ
- `WEBAPP_URL = "https://wh-branch.vercel.app?android=1"` — `?android=1` trigger Android-only UI (AndroidApp.jsx — ดู skill `android-webview-ui`)
- WebView: `javaScriptEnabled`, `domStorageEnabled`, `setSupportZoom(false)`, `MIXED_CONTENT_NEVER_ALLOW`
- **BroadcastReceiver** ลงทะเบียนใน `onResume` / ยกเลิกใน `onPause`
- **File chooser (`<input type=file>`):** override `WebChromeClient.onShowFileChooser()` → เปิด chooser กล้อง (ACTION_IMAGE_CAPTURE ผ่าน FileProvider `${applicationId}.fileprovider` → `cacheDir/images`) + แกลเลอรี (`params.createIntent()`) — **ถ้าไม่ override ปุ่มเลือกรูปจะกดแล้วเงียบ** ใช้กับหน้าแจ้งปัญหา (แนบรูปหลักฐาน — ดู skill `branch-receive`)
  - ต้องมี `<provider>` ใน AndroidManifest + `res/xml/file_paths.xml` (`<cache-path name="images" path="images/" />`)
- **หน้าจอเปิดแอปพื้นขาว:** theme `@style/AppTheme` (`values/themes.xml` + `values-v31/themes.xml`) ตั้ง `windowBackground`/`windowSplashScreenBackground` = ขาว + `webView.setBackgroundColor(WHITE)` — กัน splash/flash ดำตอนเปิด
- **App icon:** adaptive icon พื้นขาว (`mipmap-anydpi-v26/ic_launcher.xml` → foreground PNG 108–432px + `@color/ic_launcher_background` ขาว) + legacy fallback + web favicon (`public/`) — สร้างจากรูปเดียวด้วยสคริปต์ PIL (pad จัตุรัส → ย่อทุกขนาด)

## Scanner Broadcast Integration
| ยี่ห้อ | Action | Extra key |
|---|---|---|
| **KTE (เครื่องที่ใช้จริง)** | `com.kte.scan.result` | **`code`** |
| KTE (บางรุ่น) | `com.kte.scan.result` | `scanResult` |
| Zebra | `com.kte.scan.result` | `SCAN_BARCODE_1` |
| Honeywell | — | `data` |
| DataWedge | — | `com.symbol.datawedge.data_string` |

**⚠ สำคัญ:** Extra key ของ KTE เครื่องที่ใช้งานจริงคือ `"code"` — ถ้าเปลี่ยนรุ่น scanner ให้ตรวจ key ก่อน แก้ใน MainActivity.kt → ต้องลง APK ใหม่

**Android 13+ (API 33+):** ต้องใช้ `RECEIVER_EXPORTED` ใน `registerReceiver` — มิฉะนั้น broadcast จาก scanner app ภายนอกจะถูกบล็อก

Android inject barcode → WebView ด้วย:
```kotlin
webView.evaluateJavascript(
    "window.dispatchEvent(new CustomEvent('wh-scan',{detail:'$safe'}))", null
)
```

**React รับ `wh-scan` event 2 ระดับ:**
- **PackScanC** — `useEffect` รับ `wh-scan` โดยตรง → `processBarcode()` (ไม่ผ่าน input injection) — ดู skill `pack-scan`
- **App.jsx** — fallback สำหรับ BranchReceive และหน้าอื่น → inject เข้า focused input via native setter
- ถ้า `[data-android-barcode]` อยู่ใน DOM (PackScanC mount) → App.jsx handler skip ไม่ inject ซ้ำ

## Play Store In-App Updates
ใช้ `com.google.android.play:app-update-ktx:2.1.0` — Flexible update (ดาวน์โหลดใน background)
เรียก `checkForUpdates()` ทุกครั้งที่ `onResume` — จะแสดง dialog อัตโนมัติเมื่อมีเวอร์ชันใหม่ใน Play Store

## วิธี Build
1. เปิด folder `android/` ใน Android Studio
2. รัน `gradle wrapper` ครั้งแรก (สร้างไฟล์ `gradlew`)
3. Build APK / AAB → upload Play Console

**GitHub Actions:** push ไฟล์ใน `android/**` → build debug APK อัตโนมัติ → download จาก Actions Artifacts

## ต้องลง APK ใหม่หรือไม่?

| ไฟล์ที่แก้ไข | ต้องลง APK ใหม่? |
|---|---|
| ไฟล์ใน `src/` (React, CSS, JS) | ❌ ไม่ต้อง — Vercel auto-deploy, WebView โหลดใหม่อัตโนมัติ |
| `android/app/src/main/java/**.kt` | ✅ ต้องลงใหม่ — native Kotlin code |
| `android/app/src/main/AndroidManifest.xml` | ✅ ต้องลงใหม่ — permissions / config |
| `android/app/build.gradle` | ✅ ต้องลงใหม่ — dependencies / SDK version |
| `android/app/src/main/res/**` | ✅ ต้องลงใหม่ — icons / layout XML |
| `CLAUDE.md`, `README`, `.github/**` | ❌ ไม่ต้อง — ไม่กระทบ runtime |

**กฎง่ายๆ:** แก้ไฟล์ใน `android/` → ต้องลงใหม่ / แก้ไฟล์ใน `src/` → ไม่ต้อง
