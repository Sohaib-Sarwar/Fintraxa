# Testing Fintraxa mobile on a Galaxy S24 Ultra (Windows PC)

Owner's guide, also read by the executing model. Keep it current when the setup changes.
Plan: `docs/mobile/MOBILE_APP_PLAN.md` (§12 covers builds, updates and feedback).

There are two kinds of builds you will install:

| Build | What it is | When |
|---|---|---|
| **Development build** (`com.fintraxa.app.dev`, debug APK) | Loads code live from your PC; every save appears on the phone in about a second | While the app is being built |
| **Preview / production build** (`com.fintraxa.app`, release APK) | The real, fast, standalone app; updates itself over the air for JS changes | Feedback rounds and daily use |

Both can be installed side by side.

---

## 1. Prepare the phone (once)

1. **Turn on Developer options:** Settings → About phone → Software information → tap **Build number** 7 times →
   enter your PIN.
2. **Turn off Auto Blocker** (Samsung blocks installs from outside the stores and commands over USB while it is on):
   Settings → Security and privacy → **Auto Blocker** → Off. On recent One UI versions it can switch itself back on
   after a while — if an install or USB connection suddenly fails, check this first.
3. **USB debugging:** Settings → Developer options → **USB debugging** → On. (Optional: **Wireless debugging** → On.)
4. **Stay awake while charging** (Developer options) makes long debugging sessions easier.
5. **Allow installing APKs** from the app you will open them with (Chrome, My Files or WhatsApp): Android asks the
   first time — tap Settings → **Allow from this source**.
6. **Play Protect** may say the app is unrecognised: tap **More details → Install anyway** (it is your own app, signed
   by your Expo account).

## 2. Prepare the PC (once)

Needed for the daily development loop:
- Node.js LTS and Git (already installed for the web app).
- **Expo account** (free) and the CLI: `npm i -g eas-cli`, then `eas login` (you type your own password).

Only needed if you want to build APKs on your own PC instead of on Expo's servers, or see logs over USB:
- **Android Studio** (installs the Android SDK, `adb` and JDK 17). Set the environment variable `ANDROID_HOME` to
  `%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` to `PATH`.
- **Samsung Android USB Driver for Windows** if `adb devices` doesn't list the phone.
- Build native Android code **outside OneDrive** (OneDrive locks and syncs thousands of Gradle files and paths get too
  long): `git clone` the repo to `C:\dev\fintraxa` for local Android builds, and enable Windows long paths
  (`git config --global core.longpaths true`).
- `eas build --local` does **not** run on native Windows (WSL only). Use cloud builds or `npx expo run:android`.

Check the connection: plug in the phone (USB-C data cable), accept **"Allow USB debugging? Always allow from this
computer"** on the phone, then run `adb devices` — it should show the phone as `device`.

## 3. Daily development loop

1. **Install the development build once** (and again only when native modules change):
   `cd mobile && eas build --profile development --platform android` → open the install link/QR on the phone →
   install. (Or locally: `npx expo run:android --device` with the phone on USB.)
2. **Start the dev server on the PC:** `cd mobile && npx expo start`.
3. **Open "Fintraxa (dev)" on the phone** and pick the server shown, or scan the QR. Code changes on the PC appear on
   the phone within a second (Fast Refresh).
4. **If the phone can't reach the PC** (hostel/campus Wi-Fi often isolates devices):
   - USB: `adb reverse tcp:8081 tcp:8081`, then in the dev app choose **Enter URL manually** →
     `http://localhost:8081` (the cable carries the connection); or
   - `npx expo start --tunnel` (slower, works on any network); or
   - your phone's hotspot with the PC connected to it.
5. **Debugging:** press `j` in the terminal for React Native DevTools (console, network, profiler);
   `adb logcat *:E` for native errors.

## 4. Feedback rounds (preview builds)

1. The model asks you before each cloud build (the free plan has a small monthly Android build quota).
2. Build: `eas build --profile preview --platform android` → Expo gives an install page and QR code.
3. Install on your S24 Ultra first and run the smoke test in `docs/mobile/RELEASE.md`.
4. Share the install page link with testers (WhatsApp is fine). Each tester: allow installs from the browser/WhatsApp,
   turn off Auto Blocker on Samsung phones, install, sign in.
5. Testers report through **Me → Send feedback** (or a two-finger long-press anywhere). You read it in Supabase:
   `select * from app_feedback_open order by created_at desc;`
6. JS-only fixes reach installed apps without a new APK: `eas update --channel preview -m "Fix …"`. Apps pick it up on
   the next launch (Me → About → "Check for updates" forces it).

## 5. Checking speed and smoothness on the S24 Ultra

- Always judge speed on a **preview/production** build, never the development build (debug mode is much slower).
- The S24 Ultra is a flagship (120 Hz screen): use it to check that animations are a steady 120 fps
  (Developer options → **Show refresh rate**), but also test on a cheaper phone — most users won't have a flagship.
- Developer options → **Profile HWUI rendering → On screen as bars** shows dropped frames while scrolling.
- Cold start: force-stop the app (Settings → Apps → Fintraxa → Force stop), then time icon tap → figures visible.

## 6. When something goes wrong

| Problem | Fix |
|---|---|
| "App not installed" / install button greyed out | Auto Blocker on, or "Install unknown apps" not allowed for that source; a dev and release build with the **same** package name signed by different keys (uninstall the old one) |
| `adb devices` shows `unauthorized` | Unlock the phone, accept the USB debugging prompt; Developer options → Revoke USB debugging authorisations, reconnect |
| `adb devices` shows nothing | Different cable (some are charge-only), Samsung USB driver, Auto Blocker off, USB mode "File transfer" |
| Dev build can't load the bundle | Same Wi-Fi? Try `adb reverse tcp:8081 tcp:8081` or `--tunnel` |
| Fingerprint prompt never appears | A fingerprint must be enrolled in Settings → Security and privacy → Biometrics; development builds behave the same as release for this |
| Notifications don't arrive | Settings → Apps → Fintraxa → Notifications on; Battery → Unrestricted; check quiet hours in the app |
