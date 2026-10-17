# Liner — versão Android (layout de celular + 2º plano)

## O que mudou (resumo)
**Layout:** barra de navegação inferior, mini player compacto, busca e fila em tela cheia, áreas seguras (notch/barra de gestos), botão "voltar" do Android, sem controles de janela do desktop.
**Desempenho:** modo leve automático no celular (sem blur/backdrop, WebGL do player com 3 passes e 1x DPR, sincronização de letra 8x/s em vez de 60x/s), grafo de efeitos (reverb/pitch) só é criado quando você usa, cache de áudio sem cópia extra de memória e adiado/pulado em rede móvel, páginas carregadas sob demanda.
**2º plano:** Foreground Service com MediaSession + notificação de mídia, WakeLock/WifiLock, audio focus, pausa ao desconectar fone, botões na tela de bloqueio/Bluetooth.

## Como gerar o APK (no PC)
Requisitos: Node 20+, pnpm, JDK 21, Android Studio (SDK 35).

```bash
pnpm install
pnpm android:add      # cria a pasta android/ e aplica o código nativo
pnpm android:sync     # compila o front-end e sincroniza
pnpm android:open     # abre no Android Studio -> Run (ou Build > Build APK)
# ou direto: pnpm android:apk   -> android/app/build/outputs/apk/debug/app-debug.apk
```
Sempre que mudar o código web: `pnpm android:sync`.

## Teste de 2º plano (faça no seu aparelho)
1. Abra, aceite a permissão de notificação, toque uma música.
2. Vá para a tela inicial / apague a tela por 10+ minutos: deve seguir tocando e passando de faixa.
3. Controle pela notificação e pela tela de bloqueio.
4. Se o seu fabricante (Xiaomi, Samsung, Huawei, Oppo...) mata o app: Configurações > Apps > Liner > Bateria > "Sem restrições".

## Modo desempenho
`localStorage.liner_perf_mode` = `"lite"` | `"full"` | `"auto"` (padrão: lite no celular).

## Limitações conhecidas
- Não foi possível compilar/testar aqui (sem rede/SDK). Rode `pnpm build:android-web` primeiro e corrija qualquer erro de tipo que aparecer.
- Assinatura de requisições (HMAC) existe só no Electron (`window.linerElectron`). No Android as requisições vão sem assinatura, igual ao APK que você já tinha; se a API exigir assinatura, só os mantenedores do Liner podem liberar isso.
- Reverb/pitch usam Web Audio; com eles ligados o Android pode pausar o áudio em 2º plano. Deixe desligados para música em segundo plano.
- Licença do Liner: uso pessoal/local apenas. Não distribua o APK.
