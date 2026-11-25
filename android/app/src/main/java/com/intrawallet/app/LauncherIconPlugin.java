package com.intrawallet.app;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "LauncherIcon")
public class LauncherIconPlugin extends Plugin {
    private static final String[] ALIAS_NAMES = {
        "com.intrawallet.app.LauncherDefault",
        "com.intrawallet.app.LauncherChampagne",
        "com.intrawallet.app.LauncherBleu",
        "com.intrawallet.app.LauncherEmeraude"
    };

    @PluginMethod
    public void setIcon(PluginCall call) {
        String icon = call.getString("icon", "default");
        int selected;
        switch (icon) {
            case "champagne": selected = 1; break;
            case "bleu": selected = 2; break;
            case "emeraude": selected = 3; break;
            default: selected = 0;
        }

        PackageManager pm = getContext().getPackageManager();
        String packageName = getContext().getPackageName();
        for (int i = 0; i < ALIAS_NAMES.length; i++) {
            ComponentName component = new ComponentName(packageName, ALIAS_NAMES[i]);
            int state = i == selected
                ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
        }

        JSObject result = new JSObject();
        result.put("icon", icon);
        call.resolve(result);
    }
}
