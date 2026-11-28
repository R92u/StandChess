package io.github.r92u.standchess;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class AppUpdated extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            UpdateJob.packageUpdated(context);
        }
    }
}
