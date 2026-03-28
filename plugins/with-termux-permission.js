/**
 * Expo config plugin: add com.termux.permission.RUN_COMMAND to AndroidManifest.
 *
 * This custom permission is required to call Termux's RunCommandService,
 * which Shelly uses both from TermuxBridgeModule (JS bridge) and from
 * ShellyTerminalView (direct tmux resize via Intent).
 *
 * The termux-bridge module's AndroidManifest.xml declares this permission,
 * but manifest merging may not propagate it reliably to the final APK
 * during Expo prebuild. This plugin ensures it's always present.
 */
const { withAndroidManifest } = require("expo/config-plugins");

function withTermuxPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure uses-permission array exists
    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }

    const permissions = manifest["uses-permission"];
    const termuxPerm = "com.termux.permission.RUN_COMMAND";

    // Add if not already present
    const exists = permissions.some(
      (p) => p.$?.["android:name"] === termuxPerm
    );
    if (!exists) {
      permissions.push({
        $: { "android:name": termuxPerm },
      });
    }

    return config;
  });
}

module.exports = withTermuxPermission;
