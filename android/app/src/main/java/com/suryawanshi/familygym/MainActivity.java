package com.suryawanshi.familygym;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Thin shell around the live PWA. Workouts stay config-driven on GitHub Pages,
 * so plan changes never need a new APK.
 */
public class MainActivity extends Activity {
    static final String BASE = "https://himanshusurya.github.io/family-gym/";
    static final int BG = Color.parseColor("#0b0d12");
    static final int PICK = 41;

    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        applyInsets(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " FamilyGymAndroid/" + versionName());

        web.addJavascriptInterface(new Bridge(), "FamilyGymAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (state != null) web.restoreState(state);
        else web.loadUrl(BASE);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrExit);
        }
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private void applyInsets(View v) {
        if (Build.VERSION.SDK_INT < 30) return;
        v.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets i = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
        getWindow().getDecorView().setBackgroundColor(BG);
    }

    private void goBackOrExit() {
        if (web.canGoBack()) web.goBack();
        else finish();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        goBackOrExit();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req, code, data);
        if (req != PICK || pending == null) return;
        pending.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(code, data));
        pending = null;
    }

    /** Lets <input type=file> open the photo picker (profile photos). */
    private class Chrome extends WebChromeClient {
        @SuppressWarnings("deprecation")
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (pending != null) pending.onReceiveValue(null);
            pending = cb;
            try {
                startActivityForResult(params.createIntent(), PICK);
            } catch (ActivityNotFoundException e) {
                pending = null;
                cb.onReceiveValue(null);
                return false;
            }
            return true;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (url.startsWith(BASE)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame()) return;
            // Only reached before the service worker has cached the app (very first launch offline).
            String html = "<html><body style='background:#0b0d12;color:#e8eaf0;font-family:sans-serif;"
                    + "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0'>"
                    + "<div style='font-size:48px'>🏋️</div><h2>No internet</h2>"
                    + "<p style='color:#9aa0ad;text-align:center;padding:0 24px'>Connect once so Family Gym can download."
                    + " After that it works offline.</p>"
                    + "<button onclick=\"location.href='" + BASE + "'\" style='padding:12px 28px;border:0;"
                    + "border-radius:12px;background:#4f8cff;color:#fff;font-size:16px'>Try again</button></body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        }
    }

    /** Exposed to JS as window.FamilyGymAndroid — blob downloads and navigator.share don't work inside a WebView. */
    private class Bridge {
        @JavascriptInterface
        public void share(String title, String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, title)));
        }

        @JavascriptInterface
        public String saveFile(String name, String mime, String text) {
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(bytes);
                    }
                } else {
                    // Android 9 and older: hand the CSV to WhatsApp/Drive/Gmail via the share sheet.
                    Intent send = new Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, safe)
                            .putExtra(Intent.EXTRA_TEXT, text);
                    runOnUiThread(() -> startActivity(Intent.createChooser(send, "Save " + safe)));
                    return "shared";
                }
                toast("Saved to Downloads: " + safe);
                return "ok";
            } catch (Exception e) {
                toast("Could not save: " + e.getMessage());
                return "error";
            }
        }

        private void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }
    }
}
