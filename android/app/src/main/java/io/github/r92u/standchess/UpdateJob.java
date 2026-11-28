package io.github.r92u.standchess;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

public final class UpdateJob extends JobService {
    static final String CHANNEL = "game_updates";
    static final String WEB_UPDATE = "io.github.r92u.standchess.OPEN_WEB_UPDATE";
    private static final int PERIODIC = 2401, CHECK = 2402, NOTICE = 2410;
    private static final long HOUR = 3600000L;
    private final Map<Integer, Thread> active = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("updates", MODE_PRIVATE);
    }
    static boolean enabled(Context c) { return prefs(c).getBoolean("enabled", true); }
    static void channel(Context c) {
        c.getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, "Обновления игры", NotificationManager.IMPORTANCE_DEFAULT));
    }
    static boolean allowed(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = nm.getNotificationChannel(CHANNEL);
        return nm.areNotificationsEnabled() && ch != null && ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    private static PackageInfo installed(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0); }
        catch (PackageManager.NameNotFoundException e) { throw new IllegalStateException(e); }
    }
    static void setEnabled(Context c, boolean value) {
        prefs(c).edit().putBoolean("enabled", value).apply();
        if (!value) {
            prefs(c).edit().remove("installedPending").putInt("installedSeen", installed(c).versionCode).apply();
            JobScheduler jobs = c.getSystemService(JobScheduler.class);
            jobs.cancel(PERIODIC);
            jobs.cancel(CHECK);
            c.getSystemService(NotificationManager.class).cancel(NOTICE);
        } else schedule(c);
    }
    static void schedule(Context c) {
        channel(c);
        if (!enabled(c) || !allowed(c)) return;
        if (prefs(c).getBoolean("installedPending", false)) {
            notify(c, "Приложение обновлено", "Установлена версия " + installed(c).versionName, null);
            prefs(c).edit().remove("installedPending").putInt("installedSeen", installed(c).versionCode).apply();
        }
        ComponentName service = new ComponentName(c, UpdateJob.class);
        JobScheduler jobs = c.getSystemService(JobScheduler.class);
        if (jobs.getPendingJob(PERIODIC) == null)
            jobs.schedule(new JobInfo.Builder(PERIODIC, service).setPersisted(true)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(2 * HOUR).build());
        if (System.currentTimeMillis() - prefs(c).getLong("checkedAt", 0) > 600000L && jobs.getPendingJob(CHECK) == null)
            jobs.schedule(new JobInfo.Builder(CHECK, service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
    }
    static void packageUpdated(Context c) {
        if (!enabled(c) || prefs(c).getInt("installedSeen",0) >= installed(c).versionCode) return;
        prefs(c).edit().putBoolean("installedPending", true).remove("revision").putLong("checkedAt", 0).apply();
        schedule(c);
    }
    private static void notify(Context c, String title, String message, Uri release) {
        Intent open = release == null ? new Intent(c, GameActivity.class).setAction(WEB_UPDATE)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP) :
            new Intent(Intent.ACTION_VIEW, release);
        PendingIntent tap = PendingIntent.getActivity(c, release == null ? 1 : 2, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        c.getSystemService(NotificationManager.class).notify(NOTICE,
            new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.update_notice).setContentTitle(title)
                .setContentText(message).setContentIntent(tap).setAutoCancel(true).build());
    }
    private static JSONObject fetch() throws IOException, JSONException {
        HttpsURLConnection con = (HttpsURLConnection)new URL("https://r92u.github.io/StandChess/updates.json").openConnection();
        con.setConnectTimeout(8000);
        con.setReadTimeout(8000);
        con.setUseCaches(false);
        try {
            if (con.getResponseCode() != 200) throw new IOException("Feed unavailable");
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder json = new StringBuilder();
                char[] chunk = new char[512];
                int length;
                while ((length = reader.read(chunk)) != -1) {
                    if (json.length() + length > 4096) throw new IOException("Invalid feed length");
                    json.append(chunk, 0, length);
                }
                return new JSONObject(json.toString());
            }
        } finally { con.disconnect(); }
    }
    private void accept(JSONObject data) throws JSONException {
        String revision = data.getString("revision"), version = data.getString("apkVersion");
        long published = data.getLong("published");
        int code = data.getInt("apkCode");
        if (!revision.matches("[0-9a-f]{40}") || !version.matches("[0-9]+(?:\\.[0-9]+){2}") || published <= 0 || code < 1)
            throw new JSONException("Invalid release");
        SharedPreferences p = prefs(this);
        if (!enabled(this) || !allowed(this) || published < p.getLong("published",0)) return;
        String previous = p.getString("revision", "");
        SharedPreferences.Editor next = p.edit().putString("revision",revision).putLong("published",published)
            .putLong("checkedAt",System.currentTimeMillis());
        if (code > installed(this).versionCode && code > p.getInt("apkNotified",0)) {
            notify(this,"Доступен StandChess " + version,"Нажмите, чтобы открыть выпуск Android.",
                Uri.parse("https://github.com/R92u/StandChess/releases/tag/android-v" + version));
            next.putInt("apkNotified",code);
        } else if (!previous.isEmpty() && !revision.equals(previous)) {
            notify(this,"Игра обновлена","Новая веб-версия StandChess доступна в приложении.", null);
        }
        next.apply();
    }
    @Override public boolean onStartJob(JobParameters params) {
        if (!enabled(this) || !allowed(this)) return false;
        Thread worker = new Thread(() -> {
            JSONObject feed;
            try { feed = fetch(); } catch (IOException | JSONException e) { feed = null; }
            final JSONObject result = feed;
            final Thread finished = Thread.currentThread();
            main.post(() -> {
                if (active.get(params.getJobId()) != finished) return;
                active.remove(params.getJobId());
                boolean retry = result == null;
                if (result != null) {
                    try { accept(result); } catch (JSONException e) { retry = true; }
                }
                jobFinished(params, retry);
            });
        }, "StandChess update check");
        active.put(params.getJobId(), worker);
        worker.start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        Thread worker = active.remove(params.getJobId());
        if (worker != null) worker.interrupt();
        return enabled(this) && allowed(this);
    }
}
