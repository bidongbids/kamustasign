package com.nmsc.kamustasign;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android's Back button. While a screen has its own Back (Translator,
        // dashboard pages, drawers), src/lib/backNavigation.ts keeps one
        // history entry on top of the page, so going back in the web view
        // runs that screen's Back. With nothing to go back to (the start
        // screen), the app goes to the background like Home, keeping its
        // state - what Android 12+ does for any app's first screen.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView().canGoBack()) {
                    bridge.getWebView().goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }
}
