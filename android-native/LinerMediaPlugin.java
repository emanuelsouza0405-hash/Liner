package __PACKAGE__;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Ponte Capacitor: src/native/androidMedia.ts  <->  LinerMediaService. */
@CapacitorPlugin(
    name = "LinerMedia",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class LinerMediaPlugin extends Plugin {

    @Override
    public void load() {
        LinerMediaService.listener = (action, positionMs) -> {
            JSObject o = new JSObject();
            o.put("action", action);
            if (positionMs >= 0) o.put("positionMs", positionMs);
            notifyListeners("mediaAction", o);
        };
    }

    @Override
    protected void handleOnDestroy() {
        LinerMediaService.listener = null;
    }

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        LinerMediaService.ensureStarted(ctx());
        final String title = call.getString("title", "");
        final String artist = call.getString("artist", "");
        final String album = call.getString("album", "");
        final String art = call.getString("artworkUrl", "");
        final long dur = call.getLong("durationMs", 0L);
        runWhenServiceReady(s -> s.setMetadata(title, artist, album, art, dur));
        call.resolve();
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        LinerMediaService.ensureStarted(ctx());
        final String st = call.getString("state", "paused");
        final long pos = call.getLong("positionMs", 0L);
        final long dur = call.getLong("durationMs", 0L);
        final float rate = call.getFloat("rate", 1f);
        runWhenServiceReady(s -> s.setState(st, pos, dur, rate));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        LinerMediaService.stopService(ctx());
        call.resolve();
    }

    /** O serviço acabou de ser pedido: espera instanciar (até ~3s) sem travar o JS. */
    private interface ServiceTask { void run(LinerMediaService s); }

    private void runWhenServiceReady(final ServiceTask task) {
        LinerMediaService s = LinerMediaService.instance;
        if (s != null) {
            task.run(s);
            return;
        }
        new Thread(() -> {
            for (int i = 0; i < 60; i++) {
                LinerMediaService svc = LinerMediaService.instance;
                if (svc != null) {
                    task.run(svc);
                    return;
                }
                try { Thread.sleep(50); } catch (InterruptedException e) { return; }
            }
        }, "liner-media-wait").start();
    }

    // ---- permissões -------------------------------------------------------

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33
                || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Opcional: pede para o Android não "matar" o app em 2º plano (economia de bateria). */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + ctx().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(i);
        } catch (Exception ignored) { }
        call.resolve();
    }
}
