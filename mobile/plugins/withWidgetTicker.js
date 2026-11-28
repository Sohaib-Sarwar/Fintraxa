/**
 * Android resources for the home-screen widget (owner, 2026-11-28). Written into the app's res/ at prebuild, where
 * they override react-native-android-widget's own `rn_widget` layout (app resources win over a library's):
 *
 *  - The widget's frame follows Android's widget-quality rules: content reaches all four edges (the picture is
 *    stretched to the frame, `fitXY`, never letter-boxed) and the corners use the system radius
 *    (`@android:dimen/system_app_widget_background_radius` on Android 12+), with `clipToOutline` — so in a One UI
 *    stack or beside Samsung's widgets it has the same shape instead of a rigid rectangle.
 *  - The live number: a ViewFlipper of FRAMES text views (filled by the native module modules/fx-ticker) that the
 *    launcher flips once a second with a short roll-up animation, in Inter Tight (res/font/fx_num.ttf), auto-sized to
 *    the slot the picture leaves for it.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const FRAMES = 180; // keep in step with FxTicker.FRAMES (Kotlin) and ticker.ts

function frameViews() {
  return Array.from({ length: FRAMES }, (_, i) => `            <TextView android:id="@+id/fx_t${i}" style="@style/FxTick" />`).join('\n');
}

const layout = (night) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Fintraxa: overrides react-native-android-widget's rn_widget (plugins/withWidgetTicker.js). Keep the rn_widget_* ids. -->
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/fx_widget_bg"
    android:clipToOutline="true">

    <ImageView
        android:id="@+id/rn_widget_image_light"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@android:color/transparent"
        android:scaleType="fitXY"
        android:visibility="${night ? 'gone' : 'visible'}" />

    <ImageView
        android:id="@+id/rn_widget_image_dark"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@android:color/transparent"
        android:scaleType="fitXY"
        android:visibility="${night ? 'visible' : 'gone'}" />

    <FrameLayout
        android:id="@+id/fx_ticker_wrap"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:visibility="gone">
        <ViewFlipper
            android:id="@+id/fx_ticker"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:autoStart="true"
            android:flipInterval="1000"
            android:inAnimation="@anim/fx_tick_in"
            android:outAnimation="@anim/fx_tick_out">
${frameViews()}
        </ViewFlipper>
    </FrameLayout>

    <FrameLayout
        android:id="@+id/rn_widget_clickable_container"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <FrameLayout
        android:id="@+id/rn_widget_collection_container"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
`;

const tickIn = `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="240"
    android:interpolator="@android:interpolator/decelerate_cubic">
    <translate android:fromYDelta="22%" android:toYDelta="0" />
    <alpha android:fromAlpha="0" android:toAlpha="1" />
</set>
`;

const tickOut = `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="240"
    android:interpolator="@android:interpolator/accelerate_cubic">
    <translate android:fromYDelta="0" android:toYDelta="-22%" />
    <alpha android:fromAlpha="1" android:toAlpha="0" />
</set>
`;

const bg = (radius) => `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#0A0A0B" />
    <corners android:radius="${radius}" />
</shape>
`;

// Plain style everywhere; fonts and auto-size from Android 8 (API 26), where XML fonts and autoSize exist.
const styleBase = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="FxTick">
        <item name="android:layout_width">match_parent</item>
        <item name="android:layout_height">match_parent</item>
        <item name="android:gravity">start|center_vertical</item>
        <item name="android:textColor">#F5F5F3</item>
        <item name="android:textSize">34sp</item>
        <item name="android:maxLines">1</item>
        <item name="android:includeFontPadding">false</item>
        <item name="android:shadowColor">#59000000</item>
        <item name="android:shadowRadius">6</item>
        <item name="android:shadowDy">1</item>
    </style>
</resources>
`;
const style26 = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="FxTick">
        <item name="android:layout_width">match_parent</item>
        <item name="android:layout_height">match_parent</item>
        <item name="android:gravity">start|center_vertical</item>
        <item name="android:textColor">#F5F5F3</item>
        <item name="android:maxLines">1</item>
        <item name="android:includeFontPadding">false</item>
        <item name="android:fontFamily">@font/fx_num</item>
        <item name="android:letterSpacing">-0.02</item>
        <item name="android:autoSizeTextType">uniform</item>
        <item name="android:autoSizeMinTextSize">14sp</item>
        <item name="android:autoSizeMaxTextSize">72sp</item>
        <item name="android:autoSizeStepGranularity">1sp</item>
        <item name="android:shadowColor">#59000000</item>
        <item name="android:shadowRadius">6</item>
        <item name="android:shadowDy">1</item>
    </style>
</resources>
`;

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

module.exports = function withWidgetTicker(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    write(path.join(res, 'layout', 'rn_widget.xml'), layout(false));
    write(path.join(res, 'layout-night', 'rn_widget.xml'), layout(true));
    write(path.join(res, 'anim', 'fx_tick_in.xml'), tickIn);
    write(path.join(res, 'anim', 'fx_tick_out.xml'), tickOut);
    write(path.join(res, 'drawable', 'fx_widget_bg.xml'), bg('24dp'));
    write(path.join(res, 'drawable-v31', 'fx_widget_bg.xml'), bg('@android:dimen/system_app_widget_background_radius'));
    write(path.join(res, 'values', 'fx_widget.xml'), styleBase);
    write(path.join(res, 'values-v26', 'fx_widget.xml'), style26);
    const font = path.join(cfg.modRequest.projectRoot, 'node_modules', '@expo-google-fonts', 'inter-tight', '800ExtraBold', 'InterTight_800ExtraBold.ttf');
    fs.mkdirSync(path.join(res, 'font'), { recursive: true });
    fs.copyFileSync(font, path.join(res, 'font', 'fx_num.ttf'));
    return cfg;
  }]);
};
