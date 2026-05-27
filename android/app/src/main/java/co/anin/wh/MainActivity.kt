package co.anin.wh

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
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

        webView.webChromeClient = WebChromeClient()
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
