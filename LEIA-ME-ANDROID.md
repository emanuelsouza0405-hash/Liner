# Liner (Android) – build PESSOAL
Licença do projeto: uso pessoal/local permitido; NÃO distribua o APK nem este projeto.

## Gerar o APK
1. Android Studio > Open > pasta `android/`  (aguarde o Gradle sincronizar)
2. Celular com Depuração USB > Run   |   ou: Build > Build APK(s)

## Se mudar o código web
pnpm install
pnpm exec vite build -c vite.config.android.ts
pnpm exec cap sync android

## O que mudou em relação ao desktop
- src/platform/androidBridge.ts: substitui a ponte do Electron (usa o signer WASM original, sem alterações)
- vite.config.android.ts: build sem Electron
- capacitor.config.json + pasta android/
