package co.anin.wh

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.io.File
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.ktx.isFlexibleUpdateAllowed

class MainActivity : AppCompatActivity() {

    companion object {
        // เปลี่ยน URL เป็น domain จริงถ้ามี custom domain
        const val WEBAPP_URL = "https://wh-branch.vercel.app?android=1"

        // Scanner broadcast action — KTE: com.kte.scan.result
        // เพิ่ม action อื่นได้ใน onResume() ถ้าใช้ scanner ยี่ห้ออื่น
        const val SCAN_ACTION_KTE  = "com.kte.scan.result"
        const val SCAN_ACTION_CUSTOM = "co.anin.wh.SCAN"  // fallback via Settings screen

        const val UPDATE_REQUEST_CODE = 500
    }

    private lateinit var webView: WebView

    // ── File chooser (input type=file) ──
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val cb = filePathCallback
            filePathCallback = null
            if (cb == null) return@registerForActivityResult
            var uris: Array<Uri>? = null
            if (result.resultCode == Activity.RESULT_OK) {
                val data = result.data
                when {
                    data?.dataString != null -> uris = arrayOf(Uri.parse(data.dataString))
                    data?.clipData != null -> {
                        val clip = data.clipData!!
                        uris = Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                    }
                    cameraImageUri != null -> uris = arrayOf(cameraImageUri!!)
                }
            }
            cb.onReceiveValue(uris ?: arrayOf())
            cameraImageUri = null
        }

    private fun createCameraUri(): Uri? = try {
        val dir = File(cacheDir, "images").apply { mkdirs() }
        val file = File(dir, "evidence_${System.currentTimeMillis()}.jpg")
        FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
    } catch (_: Exception) { null }

    // รับ barcode จาก scanner ทุกยี่ห้อ — ลองอ่าน extra key ตามลำดับ
    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val barcode = intent.getStringExtra("code")                // KTE (extra key จริง)
                ?: intent.getStringExtra("scanResult")              // KTE (บางรุ่น)
                ?: intent.getStringExtra("SCAN_BARCODE_1")          // Zebra
                ?: intent.getStringExtra("data")                    // Honeywell
                ?: intent.getStringExtra("com.symbol.datawedge.data_string") // DataWedge
                ?: return

            if (barcode.isBlank()) return

            // escape เพื่อป้องกัน JS injection
            val safe = barcode
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "")
                .replace("\r", "")

            webView.post {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('wh-scan',{detail:'$safe'}))",
                    null
                )
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()
        webView.loadUrl(WEBAPP_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled   = true
            allowFileAccess   = true
            cacheMode         = WebSettings.LOAD_DEFAULT
            useWideViewPort   = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            displayZoomControls = false
            // ป้องกัน mixed-content บน HTTPS app
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams?
            ): Boolean {
                // ยกเลิก callback ค้างเก่า (ถ้ามี)
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                // intent กล้อง (ถ่ายใหม่)
                cameraImageUri = createCameraUri()
                val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    if (cameraImageUri != null) {
                        putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri)
                        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    }
                }

                // intent เลือกรูปจากเครื่อง (แกลเลอรี/ไฟล์)
                val contentIntent = params?.createIntent()
                    ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "image/*"
                    }

                val chooser = Intent(Intent.ACTION_CHOOSER).apply {
                    putExtra(Intent.EXTRA_INTENT, contentIntent)
                    putExtra(Intent.EXTRA_TITLE, "เลือกรูปหลักฐาน")
                    if (cameraImageUri != null) {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                    }
                }

                return try {
                    fileChooserLauncher.launch(chooser)
                    true
                } catch (_: Exception) {
                    filePathCallback = null
                    cameraImageUri = null
                    false
                }
            }
        }
        webView.webViewClient   = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                // เปิดทุก URL ใน WebView (single-page app)
                return false
            }
        }
    }

    override fun onResume() {
        super.onResume()

        val filter = IntentFilter().apply {
            addAction(SCAN_ACTION_KTE)
            addAction(SCAN_ACTION_CUSTOM)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // RECEIVER_EXPORTED อนุญาตให้รับ broadcast จาก scanner app ภายนอก (KTE, Zebra ฯลฯ)
            registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(scanReceiver, filter)
        }

        checkForUpdates()
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(scanReceiver) } catch (_: Exception) {}
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    private fun checkForUpdates() {
        val manager = AppUpdateManagerFactory.create(this)
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && info.isFlexibleUpdateAllowed) {
                manager.startUpdateFlow(
                    info,
                    this,
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
                )
            }
        }
    }
}
