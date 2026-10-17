// Roda DEPOIS de `cap add android` / `cap sync android` (idempotente).
// Copia o código nativo de reprodução em 2º plano para o projeto Android e
// ajusta AndroidManifest.xml + build.gradle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appId = "com.hkamori.liner.mobile"; // mantenha igual ao capacitor.config.ts
const androidDir = path.join(root, "android");
const appDir = path.join(androidDir, "app");

if (!fs.existsSync(appDir)) {
  console.error("Pasta android/ não existe. Rode primeiro: pnpm android:add");
  process.exit(1);
}

// 1) Java nativo -------------------------------------------------------------
const javaDir = path.join(appDir, "src/main/java", ...appId.split("."));
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ["LinerMediaService.java", "LinerMediaPlugin.java", "MainActivity.java"]) {
  const src = fs.readFileSync(path.join(root, "android-native", f), "utf8");
  fs.writeFileSync(path.join(javaDir, f), src.replaceAll("__PACKAGE__", appId));
}

// 2) AndroidManifest.xml -----------------------------------------------------
const manifestPath = path.join(appDir, "src/main/AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");

const perms = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.WAKE_LOCK",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.ACCESS_WIFI_STATE",
];
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace(
      "</manifest>",
      `    <uses-permission android:name="${p}" />\n</manifest>`,
    );
  }
}

if (!manifest.includes("LinerMediaService")) {
  manifest = manifest.replace(
    "</application>",
    `    <service
            android:name=".LinerMediaService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
    </application>`,
  );
}
if (!manifest.includes("usesCleartextTraffic")) {
  // fallback http://edge.tryliner.fun:10518 do app
  manifest = manifest.replace("<application", '<application\n        android:usesCleartextTraffic="true"');
}
fs.writeFileSync(manifestPath, manifest);

// 3) build.gradle (dependência da notificação de mídia) ----------------------
const gradlePath = path.join(appDir, "build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");
if (!gradle.includes("androidx.media:media")) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    'dependencies {\n    implementation "androidx.media:media:1.7.0"',
  );
  fs.writeFileSync(gradlePath, gradle);
}

console.log("✔ Android configurado (serviço de 2º plano, permissões, notificação de mídia).");
