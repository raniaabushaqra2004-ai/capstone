# Android Release Prep

This project already has a working debug build path. To make it store-ready, the remaining steps are mostly operational rather than code-only:

1. Create a signing key with `keytool`.
2. Add release signing settings in the Android project.
3. Replace debug icons/splash assets if needed.
4. Build a signed release APK or AAB.
5. Test the release build on a real device.
6. Submit through Google Play Console.

## Recommended release checklist

- Update app name, version code, and version name.
- Verify `app-config.js` points to a deployed backend.
- Confirm privacy/consent flow wording.
- Confirm local session history and feedback behavior.
- Test doctor summary, decision page, dashboard, and supportive care pages on a real device.
- Verify dark mode and Arabic/English switching.

## Important note

The codebase can be prepared for release without signing credentials, but the final signed build requires your own keystore and store account.
