package __PACKAGE__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground Service de reprodução (igual aos players de música tradicionais):
 *  - mantém o app vivo com a tela apagada / app em 2º plano
 *  - MediaSession + notificação de mídia (tela de bloqueio, fones, Bluetooth, Android Auto)
 *  - WakeLock/WifiLock enquanto toca (o stream não cai com a tela desligada)
 *  - Audio focus (pausa em ligação, volta depois) e "becoming noisy" (fone desconectado)
 *
 * O ÁUDIO em si continua sendo tocado pelo <audio> do WebView; este serviço só
 * mantém o processo vivo e expõe os controles do sistema.
 */
public class LinerMediaService extends Service {

    public interface ActionListener {
        void onAction(String action, long positionMs);
    }

    static final String CHANNEL_ID = "liner_playback";
    static final int NOTIFICATION_ID = 4711;

    static final String ACT_START = "liner.START";
    static final String ACT_PLAY = "liner.PLAY";
    static final String ACT_PAUSE = "liner.PAUSE";
    static final String ACT_NEXT = "liner.NEXT";
    static final String ACT_PREV = "liner.PREV";
    static final String ACT_STOP = "liner.STOP";

    static volatile LinerMediaService instance;
    static volatile ActionListener listener;
    static volatile boolean isPlaying = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private MediaSessionCompat session;
    private NotificationManager nm;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasFocus = false;
    private boolean resumeOnFocusGain = false;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean noisyRegistered = false;

    private String title = "Liner";
    private String artist = "";
    private String album = "";
    private long durationMs = 0;
    private Bitmap artwork;
    private String artworkUrl = "";
    private int state = PlaybackStateCompat.STATE_PAUSED;
    private long positionMs = 0;
    private float rate = 1f;
    private boolean foregroundStarted = false;

    // ------------------------------------------------------------------ API estática

    /** Garante que o serviço está de pé (chamar com o app em primeiro plano). */
    static void ensureStarted(Context ctx) {
        if (instance != null) return;
        Intent i = new Intent(ctx, LinerMediaService.class).setAction(ACT_START);
        androidx.core.content.ContextCompat.startForegroundService(ctx, i);
    }

    static void stopService(Context ctx) {
        LinerMediaService s = instance;
        if (s != null) s.main.post(s::shutdown);
    }

    // ------------------------------------------------------------------ ciclo de vida

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        createChannel();

        session = new MediaSessionCompat(this, "LinerMedia");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { dispatch("play", -1); }
            @Override public void onPause() { dispatch("pause", -1); }
            @Override public void onSkipToNext() { dispatch("next", -1); }
            @Override public void onSkipToPrevious() { dispatch("previous", -1); }
            @Override public void onStop() { dispatch("stop", -1); }
            @Override public void onSeekTo(long pos) { dispatch("seek", pos); }
        });
        session.setActive(true);
        applyPlaybackState();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Precisa chamar startForeground logo após startForegroundService()
        if (!foregroundStarted) goForeground();

        String a = intent != null ? intent.getAction() : null;
        if (a != null) {
            switch (a) {
                case ACT_PLAY: dispatch("play", -1); break;
                case ACT_PAUSE: dispatch("pause", -1); break;
                case ACT_NEXT: dispatch("next", -1); break;
                case ACT_PREV: dispatch("previous", -1); break;
                case ACT_STOP: dispatch("stop", -1); break;
                default: break;
            }
        }
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Usuário deslizou o app da lista de recentes: se não está tocando, encerra.
        if (!isPlaying) shutdown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseLocks();
        abandonFocus();
        unregisterNoisy();
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        io.shutdownNow();
        isPlaying = false;
        instance = null;
        super.onDestroy();
    }

    private void shutdown() {
        isPlaying = false;
        releaseLocks();
        abandonFocus();
        unregisterNoisy();
        stopForeground(true);
        foregroundStarted = false;
        stopSelf();
    }

    // ------------------------------------------------------------------ atualizações vindas do JS

    void setMetadata(String t, String ar, String al, String artUrl, long dur) {
        main.post(() -> {
            title = t == null || t.isEmpty() ? "Liner" : t;
            artist = ar == null ? "" : ar;
            album = al == null ? "" : al;
            durationMs = Math.max(0, dur);
            boolean artChanged = artUrl != null && !artUrl.equals(artworkUrl);
            if (artChanged) {
                artworkUrl = artUrl;
                artwork = null;
            }
            applyMetadata();
            postNotification();
            if (artChanged && !artUrl.isEmpty()) loadArtwork(artUrl);
        });
    }

    void setState(String st, long pos, long dur, float r) {
        main.post(() -> {
            positionMs = Math.max(0, pos);
            if (dur > 0 && dur != durationMs) {
                durationMs = dur;
                applyMetadata();
            }
            rate = r > 0 ? r : 1f;
            switch (st) {
                case "playing": state = PlaybackStateCompat.STATE_PLAYING; break;
                case "buffering": state = PlaybackStateCompat.STATE_BUFFERING; break;
                default: state = PlaybackStateCompat.STATE_PAUSED; break;
            }
            boolean active = state == PlaybackStateCompat.STATE_PLAYING
                    || state == PlaybackStateCompat.STATE_BUFFERING;
            isPlaying = active;
            if (active) {
                requestFocus();
                acquireLocks();
                registerNoisy();
            } else {
                releaseLocks();
                unregisterNoisy();
            }
            applyPlaybackState();
            postNotification();
        });
    }

    // ------------------------------------------------------------------ sessão / notificação

    private void applyMetadata() {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork);
        }
        session.setMetadata(b.build());
    }

    private void applyPlaybackState() {
        long actions = PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_STOP;
        PlaybackStateCompat ps = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, positionMs, state == PlaybackStateCompat.STATE_PLAYING ? rate : 0f)
                .build();
        session.setPlaybackState(ps);
    }

    private void loadArtwork(final String url) {
        io.execute(() -> {
            Bitmap bmp = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inPreferredConfig = Bitmap.Config.RGB_565;
                    // reduz para economizar memória (capa só precisa de ~512px)
                    o.inSampleSize = 2;
                    bmp = BitmapFactory.decodeStream(in, null, o);
                }
            } catch (Exception ignored) { }
            final Bitmap result = bmp;
            main.post(() -> {
                if (result != null && url.equals(artworkUrl)) {
                    artwork = result;
                    applyMetadata();
                    postNotification();
                }
            });
        });
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Reprodução", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
    }

    private PendingIntent actionIntent(String action, int req) {
        Intent i = new Intent(this, LinerMediaService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, req, i, flags);
    }

    private Notification buildNotification() {
        boolean playing = state == PlaybackStateCompat.STATE_PLAYING
                || state == PlaybackStateCompat.STATE_BUFFERING;

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = open == null ? null : PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist)
                .setSubText(album.isEmpty() ? null : album)
                .setContentIntent(content)
                .setDeleteIntent(actionIntent(ACT_STOP, 5))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(android.R.drawable.ic_media_previous, "Anterior", actionIntent(ACT_PREV, 1))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pausar" : "Tocar",
                        actionIntent(playing ? ACT_PAUSE : ACT_PLAY, 2))
                .addAction(android.R.drawable.ic_media_next, "Próxima", actionIntent(ACT_NEXT, 3))
                .setStyle(new MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        if (artwork != null) b.setLargeIcon(artwork);
        return b.build();
    }

    private void goForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        foregroundStarted = true;
    }

    private void postNotification() {
        if (!foregroundStarted) {
            goForeground();
            return;
        }
        try {
            nm.notify(NOTIFICATION_ID, buildNotification());
        } catch (SecurityException ignored) { /* sem permissão de notificação */ }
    }

    // ------------------------------------------------------------------ audio focus / noisy / locks

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS:
                hasFocus = false;
                resumeOnFocusGain = false;
                dispatch("pause", -1);
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                resumeOnFocusGain = isPlaying;
                dispatch("pause", -1);
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                if (resumeOnFocusGain) {
                    resumeOnFocusGain = false;
                    dispatch("play", -1);
                }
                break;
            default: // AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK: o sistema já abaixa o volume
                break;
        }
    };

    private void requestFocus() {
        if (hasFocus) return;
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build())
                        .setOnAudioFocusChangeListener(focusListener, main)
                        .build();
            }
            r = audioManager.requestAudioFocus(focusRequest);
        } else {
            //noinspection deprecation
            r = audioManager.requestAudioFocus(focusListener,
                    AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        hasFocus = r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonFocus() {
        if (!hasFocus) return;
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            //noinspection deprecation
            audioManager.abandonAudioFocus(focusListener);
        }
        hasFocus = false;
    }

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) {
                dispatch("pause", -1); // fone desconectado
            }
        }
    };

    private void registerNoisy() {
        if (noisyRegistered) return;
        registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        noisyRegistered = true;
    }

    private void unregisterNoisy() {
        if (!noisyRegistered) return;
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) { }
        noisyRegistered = false;
    }

    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Liner:playback");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(6 * 60 * 60 * 1000L); // trava de segurança: 6h
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Liner:wifi");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseLocks() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) { }
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) { }
    }

    private void dispatch(String action, long pos) {
        ActionListener l = listener;
        if (l != null) l.onAction(action, pos);
    }
}
