package __PACKAGE__;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LinerMediaPlugin.class); // precisa vir ANTES do super.onCreate
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView web = getBridge().getWebView();
        if (web != null) {
            WebSettings s = web.getSettings();
            s.setMediaPlaybackRequiresUserGesture(false); // faixa seguinte toca sozinha em 2º plano
        }
    }

    /** Com música tocando, não deixa o WebView "dormir" ao sair do app. */
    private void keepWebViewAlive() {
        if (!LinerMediaService.isPlaying) return;
        WebView web = getBridge().getWebView();
        if (web == null) return;
        web.onResume();
        web.resumeTimers();
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAlive();
    }
}
