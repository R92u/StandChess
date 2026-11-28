package io.github.r92u.standchess;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GameActivity extends Activity {
    private static final String SITE = "https://r92u.github.io/StandChess/";
    private static final String INVITES = "https://standchess-r92u.onrender.com/";
    private static final Pattern ROOM = Pattern.compile("[a-f0-9]{24}");
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d+)-(\\d*)");
    private WebView game;
    private Button retry;
    private volatile boolean bundled;

    static String gameUrl(Uri uri) {
        if (uri == null || !uri.isHierarchical()) return null;
        String base = uri.buildUpon().clearQuery().fragment(null).build().toString();
        if (!base.equals(SITE) && !base.equals(INVITES)) return null;
        String room = uri.getQueryParameter("room");
        String duel = uri.getQueryParameter("duel");
        if (duel != null && ROOM.matcher(duel).matches()) return SITE + "?duel=" + duel;
        if (room != null && ROOM.matcher(room).matches()) return SITE + "?room=" + room;
        return "1".equals(uri.getQueryParameter("online")) ? SITE + "?online=1" : SITE;
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout frame = new LinearLayout(this);
        frame.setOrientation(LinearLayout.VERTICAL);
        frame.setBackgroundColor(Color.rgb(6, 22, 38));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        retry = new Button(this);
        retry.setText("Версия из APK · Проверить обновление");
        retry.setAllCaps(false);
        retry.setTextColor(Color.rgb(224, 239, 251));
        retry.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(31, 62, 88)));
        retry.setVisibility(View.GONE);
        retry.setOnClickListener(view -> {
            bundled = false;
            retry.setVisibility(View.GONE);
            game.reload();
        });
        frame.addView(retry);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(6, 22, 38));
        frame.addView(game, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(frame);

        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " StandChessAndroid/1.4");
        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new GameClient());
        String start = saved == null ? null : saved.getString("url");
        if (start != null) start = gameUrl(Uri.parse(start));
        if (start == null) start = gameUrl(getIntent().getData());
        game.loadUrl(start == null ? SITE : start);
        UpdateJob.channel(this);
        if (UpdateJob.enabled(this) && !UpdateJob.prefs(this).getBoolean("asked", false)) askForAlerts();
    }
    private void askForAlerts() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            UpdateJob.prefs(this).edit().putBoolean("asked", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 401);
        }
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 401) {
            UpdateJob.schedule(this);
            sendAlertState();
        }
    }
    private void sendAlertState() {
        if (game == null || game.getUrl() == null || gameUrl(Uri.parse(game.getUrl())) == null) return;
        game.evaluateJavascript("document.dispatchEvent(new CustomEvent('standchess-alerts',{detail:{enabled:" +
            UpdateJob.enabled(this) + ",allowed:" + UpdateJob.allowed(this) + "}}))", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (UpdateJob.WEB_UPDATE.equals(intent.getAction()) && game.getUrl() != null) {
            String current = gameUrl(Uri.parse(game.getUrl()));
            if (current != null) {
                bundled = false;
                retry.setVisibility(View.GONE);
                game.loadUrl(current);
                return;
            }
        }
        String url = gameUrl(intent.getData());
        if (url != null && !url.equals(game.getUrl())) game.loadUrl(url);
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putString("url", game.getUrl());
    }
    @Override protected void onPause() { game.onPause(); super.onPause(); }
    @Override protected void onResume() {
        super.onResume();
        game.onResume();
        UpdateJob.schedule(this);
        sendAlertState();
    }
    @Override protected void onDestroy() {
        ((LinearLayout) game.getParent()).removeView(game);
        game.destroy();
        super.onDestroy();
    }
    @Override public void onBackPressed() {
        game.evaluateJavascript("(() => {const d=document.querySelector('dialog[open]');" +
                "if(d){d.close();return true}return false})()", result -> {
            if ("true".equals(result)) return;
            if (game.canGoBack()) game.goBack(); else finish();
        });
    }

    private final class GameClient extends WebViewClient {
        @Override public void onPageFinished(WebView view, String url) { sendAlertState(); }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            Uri uri = request.getUrl();
            if ("standchess".equals(uri.getScheme()) && "updates".equals(uri.getHost())) {
                if (!request.hasGesture() || view.getUrl() == null || gameUrl(Uri.parse(view.getUrl())) == null) return true;
                if ("/system".equals(uri.getPath())) {
                    Intent settings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    settings.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(settings);
                } else if ("/enable".equals(uri.getPath()) || "/disable".equals(uri.getPath())) {
                    boolean enable = "/enable".equals(uri.getPath());
                    UpdateJob.setEnabled(GameActivity.this, enable);
                    if (enable) askForAlerts();
                    sendAlertState();
                }
                return true;
            }
            String local = gameUrl(uri);
            if (local != null) {
                if (uri.toString().startsWith(SITE)) return false;
                view.loadUrl(local);
            } else if ("https".equals(uri.getScheme()) && request.hasGesture()) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (ActivityNotFoundException ignored) { }
            }
            return true;
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) useBundled(request.getUrl());
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
            if (request.isForMainFrame() && error.getStatusCode() >= 400) useBundled(request.getUrl());
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!bundled || !request.getUrl().toString().startsWith(SITE)) return null;
            String path = request.getUrl().getPath().substring("/StandChess/".length());
            if (path.isEmpty()) path = "index.html";
            if (!path.matches("[a-zA-Z0-9_./-]+") || path.contains("..")) return missingAsset();
            try {
                InputStream input = getAssets().open(path);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                        path.substring(path.lastIndexOf('.') + 1));
                if (path.endsWith(".js")) mime = "application/javascript";
                if (mime == null) mime = "application/octet-stream";
                String range = request.getRequestHeaders().get("Range");
                if (range != null && (path.endsWith(".mp3") || path.endsWith(".mp4")))
                    return rangedMedia(input, mime, range);
                return new WebResourceResponse(mime, null, input);
            } catch (IOException e) { return missingAsset(); }
        }
    }
    private void useBundled(Uri failed) {
        String url = gameUrl(failed);
        if (bundled || url == null) return;
        bundled = true;
        retry.setVisibility(View.VISIBLE);
        game.post(() -> game.loadUrl(url));
    }
    private static WebResourceResponse missingAsset() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                new ByteArrayInputStream(new byte[0]));
    }
    private static WebResourceResponse rangedMedia(InputStream input, String mime, String range) throws IOException {
        Matcher matcher = RANGE.matcher(range);
        if (!matcher.matches()) return new WebResourceResponse(mime, null, input);
        byte[] bytes;
        try (InputStream stream = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
            bytes = out.toByteArray();
        }
        long start, end;
        try {
            start = Long.parseLong(matcher.group(1));
            end = matcher.group(2).isEmpty() ? bytes.length - 1 :
                    Math.min(Long.parseLong(matcher.group(2)), bytes.length - 1);
        } catch (NumberFormatException e) { start = bytes.length; end = -1; }
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        if (start > end) {
            headers.put("Content-Range", "bytes */" + bytes.length);
            return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, null);
        }
        int length = (int)(end - start + 1);
        headers.put("Content-Length", String.valueOf(length));
        headers.put("Content-Range", "bytes " + start + "-" + end + "/" + bytes.length);
        return new WebResourceResponse(mime, null, 206, "Partial Content", headers,
                new ByteArrayInputStream(bytes, (int) start, length));
    }
}
