# Medika AI Mobile App Setup

This project is now prepared for a Capacitor mobile shell, but there is one important rule:

- The current chat flow depends on the Python API in `app.py`.
- A store app cannot rely on that API running locally inside the phone browser.
- For Android/iPhone packaging, the mobile app should call a deployed backend API.

## 1. Configure the API base

Edit [app-config.js](/C:/Users/adnan/Documents/Codex/2026-04-30/files-mentioned-by-the-user-altibbi/app-config.js) before mobile packaging.

Default web behavior:

```js
window.MEDIKA_CONFIG = {
    apiBase: "",
};
```

For mobile packaging, set it to your deployed backend:

```js
window.MEDIKA_CONFIG = {
    apiBase: "https://your-medika-api.example.com",
};
```

## 2. Allow mobile origins on the backend

`app.py` now supports CORS for:

- `capacitor://localhost`
- `http://localhost`
- `http://127.0.0.1`

You can also add more allowed origins with:

```powershell
$env:MEDIKA_ALLOWED_ORIGINS="https://your-domain.com,capacitor://localhost"
```

## 3. Install mobile dependencies

Run:

```powershell
npm install
```

## 4. Prepare the mobile web bundle

Run:

```powershell
npm run mobile:prepare
```

This creates `mobile-web/`, which Capacitor uses as the app web bundle.

## 5. Add native platforms

Android:

```powershell
npm run mobile:add:android
```

iPhone:

```powershell
npm run mobile:add:ios
```

## 6. Sync changes

```powershell
npm run mobile:sync
```

## 7. Open the native project

Android Studio:

```powershell
npm run mobile:open:android
```

Xcode:

```powershell
npm run mobile:open:ios
```

## 8. Store readiness

Before publishing to Google Play or the Apple App Store, you still need:

- final app icon and splash assets
- app privacy text
- store screenshots
- package/bundle identifiers you own
- real-device testing
- a deployed backend URL

## Local testing from phone

To test the Python server from another device on the same network:

```powershell
$env:HOST="0.0.0.0"
py app.py
```

Then open your computer IP with port `8000` from the phone browser.
