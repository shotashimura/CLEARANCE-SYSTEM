// ============================================================================
// CLEARANCE SYSTEM — M5Stack CoreS3 OSC 受信テスト
// ----------------------------------------------------------------------------
// 中央サーバー（または server/tools/oscSend.js）から UDP/OSC で送られてくる
//   /suitcase/<ID>/speed       (float)
//   /suitcase/<ID>/direction   (float  -1 / 0 / 1)
//   /suitcase/<ID>/duration    (float)
//   /suitcase/<ID>/behavior    (string)
//   /suitcase/<ID>/jitter      (float)
//   /suitcase/<ID>/hesitation  (float)
//   /suitcase/<ID>/steering    (float  -1..1)
// を受信し、最新値を CoreS3 の画面に表示する。
//
// ★この段階ではモーターは動かさない（受信確認のみ）。
//  ESC / ステアリングサーボの PWM 駆動は末尾のコメント雛形を参照（後日）。
//
// 必要なライブラリ（Arduino IDE のライブラリマネージャからインストール）:
//   - M5Unified            （CoreS3 の画面・電源管理）
//   - OSC                  （CNMAT / Adrian Freed, Yotam Mann 製。"OSC" で検索）
// ボード設定: ツール → ボード → M5Stack → "M5CoreS3"
// ============================================================================

#include <M5Unified.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <OSCMessage.h>

// ---- WiFi 認証情報は secrets.h に置く（.gitignore 済み・コミットされない）----
// 同じフォルダに secrets.h を作り、以下を記入する:
//   #define WIFI_SSID "あなたのWiFi名"
//   #define WIFI_PASS "あなたのパスワード"
// secrets.h が無い場合は下のプレースホルダにフォールバックする（そのままでは接続しない）。
#if defined(__has_include)
  #if __has_include("secrets.h")
    #include "secrets.h"
  #endif
#endif
#ifndef WIFI_SSID
  #define WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
  #define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif

// ---- ここを自分の環境に合わせて編集 ----------------------------------------
const int   SUITCASE_ID = 1;                    // ← この機体が担当する番号 (1..5)
const uint16_t OSC_PORT = 8000;                 // ← fleet.js の m5stack.port と一致
// ---------------------------------------------------------------------------

WiFiUDP Udp;

// 受信した最新値
float   vSpeed = 0, vDirection = 0, vDuration = 0;
float   vJitter = 0, vHesitation = 0, vSteering = 0;
char    vBehavior[24] = "-";
unsigned long lastPacketMs = 0;
unsigned long packetCount = 0;
bool    dirty = true;

// この機体が反応する OSC アドレスの接頭辞: "/suitcase/<ID>/"
char addrPrefix[24];

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);

  snprintf(addrPrefix, sizeof(addrPrefix), "/suitcase/%d/", SUITCASE_ID);

  // WiFi 接続
  M5.Display.setCursor(0, 0);
  M5.Display.printf("WiFi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint8_t tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 60) {
    delay(500);
    M5.Display.print(".");
    tries++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    M5.Display.fillScreen(TFT_RED);
    M5.Display.setCursor(0, 0);
    M5.Display.setTextColor(TFT_WHITE, TFT_RED);
    M5.Display.println("WiFi FAILED");
    return;
  }

  Udp.begin(OSC_PORT);
  Serial.begin(115200);
  Serial.printf("Listening OSC on %s:%u  prefix=%s\n",
                WiFi.localIP().toString().c_str(), OSC_PORT, addrPrefix);
  dirty = true;
}

// OSC アドレスの末尾セグメント（param 名）を返す
const char* lastSegment(const char* addr) {
  const char* p = strrchr(addr, '/');
  return p ? p + 1 : addr;
}

void handleMessage(OSCMessage& msg) {
  char addr[64];
  msg.getAddress(addr);

  // 自分の担当 (/suitcase/<ID>/...) でなければ無視
  if (strncmp(addr, addrPrefix, strlen(addrPrefix)) != 0) return;

  const char* param = lastSegment(addr);
  packetCount++;
  lastPacketMs = millis();
  dirty = true;

  if (msg.isString(0)) {
    msg.getString(0, vBehavior, sizeof(vBehavior));
    return;
  }
  if (!msg.isFloat(0) && !msg.isInt(0)) return;
  float v = msg.isFloat(0) ? msg.getFloat(0) : (float)msg.getInt(0);

  if      (strcmp(param, "speed") == 0)       vSpeed = v;
  else if (strcmp(param, "direction") == 0)   vDirection = v;
  else if (strcmp(param, "duration") == 0)    vDuration = v;
  else if (strcmp(param, "jitter") == 0)      vJitter = v;
  else if (strcmp(param, "hesitation") == 0)  vHesitation = v;
  else if (strcmp(param, "steering") == 0)    vSteering = v;

  // ▼ モーター制御する段階になったら、ここで applyMotion() を呼ぶ（末尾コメント参照）
  // applyMotion();
}

void drawScreen() {
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_CYAN, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(0, 0);
  M5.Display.printf("CLEARANCE  #%03d\n", SUITCASE_ID);

  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_DARKGREY, TFT_BLACK);
  M5.Display.printf("IP %s : %u\n", WiFi.localIP().toString().c_str(), OSC_PORT);

  // 直近受信からの経過
  unsigned long ago = lastPacketMs ? (millis() - lastPacketMs) : 0;
  bool live = lastPacketMs && ago < 2000;
  M5.Display.setTextColor(live ? TFT_GREEN : TFT_RED, TFT_BLACK);
  M5.Display.printf("link %s  pkt %lu  %lums ago\n",
                    live ? "LIVE" : "----", packetCount, lastPacketMs ? ago : 0);

  M5.Display.setTextSize(2);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setCursor(0, 56);
  M5.Display.printf("speed  %6.2f\n", vSpeed);
  M5.Display.printf("dir    %6.2f\n", vDirection);
  M5.Display.printf("steer  %6.2f\n", vSteering);
  M5.Display.printf("behav  %s\n", vBehavior);

  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_DARKGREY, TFT_BLACK);
  M5.Display.printf("\ndur %.1f  jit %.2f  hes %.2f\n", vDuration, vJitter, vHesitation);
}

void loop() {
  M5.update();

  // OSC 受信（1パケット = 1メッセージ）
  int size = Udp.parsePacket();
  if (size > 0) {
    OSCMessage msg;
    while (size--) msg.fill(Udp.read());
    if (!msg.hasError()) handleMessage(msg);
  }

  // 画面更新（受信があった時だけ、最大 ~20fps）
  static unsigned long lastDraw = 0;
  if (dirty && millis() - lastDraw > 50) {
    drawScreen();
    lastDraw = millis();
    dirty = false;
  }
}

// ============================================================================
// 【次のステップ = TODO B: モーター駆動】ESC + ステアリングサーボの PWM 駆動
// ----------------------------------------------------------------------------
// 設計・配線の詳細は firmware/WIRING.md を参照。要点と作業順:
//   1. CoreS3 Grove Port A の GPIO 番号を現物確認 → ESC_PIN / STEER_PIN を確定
//      （通常 G1=GPIO1 / G2=GPIO2。ESP32-S3 は LEDC でどのGPIOからもPWM可）
//   2. 配線: LiPo→ESC(XT60) / LiPo→DC-DC(12V→5V)→サーボ / G1→ESC信号 G2→サーボ信号
//      ★共通グランド必須（M5 GND と ESC/サーボ GND を必ず接続）
//      ★ベンチテストは M5 を USB 給電にしてサーボ電源と分離（ブラウンアウト防止）
//   3. 下の motionSetup() / applyMotion() を有効化（GAIN は控えめ ±300us から）
//      起動時に 1500us を数秒送って ESC アーミング（ピピッ）
//   4. ★タイヤを浮かせて★ oscSend.js で speed/steering を小さく送り回転・操舵を確認
//   5. OK後、behavior(hesitant/frozen/random_walk/assertive) を動作パターンに反映
//
// CoreS3 は ESP32-S3。LEDC(PWM) でRCサーボ/ESC（50Hz, 1000〜2000us）を駆動する。
// 配線が決まったら ESC_PIN / STEER_PIN を実ピンに設定し、applyMotion() を
// handleMessage() の末尾から呼ぶ。
//
// const int ESC_PIN   = 1;   // ← ESC(スロットル) 信号線。Groveや拡張から取る
// const int STEER_PIN = 2;   // ← ステアリングサーボ信号線
// const int PWM_FREQ  = 50;  // 50Hz (RC標準)
// const int PWM_RES   = 16;  // 16bit 分解能
//
// // duty(16bit) = pulse_us / 20000us * 65535
// uint32_t usToDuty(float us) { return (uint32_t)(us / 20000.0f * 65535.0f); }
//
// void motionSetup() {
//   ledcSetup(0, PWM_FREQ, PWM_RES); ledcAttachPin(ESC_PIN, 0);
//   ledcSetup(1, PWM_FREQ, PWM_RES); ledcAttachPin(STEER_PIN, 1);
//   ledcWrite(0, usToDuty(1500)); // ESC ニュートラル（要アーミング）
//   ledcWrite(1, usToDuty(1500)); // サーボ中立
// }
//
// void applyMotion() {
//   // speed(-0.5..1.4) × direction(-1..1) を 1100..1900us にマッピング
//   float throttle = vSpeed * (vDirection >= 0 ? 1.0f : -1.0f);
//   throttle = constrain(throttle, -1.0f, 1.0f);
//   float escUs = 1500 + throttle * 400;            // 1100(後退)..1900(前進)
//   float steerUs = 1500 + constrain(vSteering, -1.0f, 1.0f) * 400;
//   ledcWrite(0, usToDuty(escUs));
//   ledcWrite(1, usToDuty(steerUs));
// }
// ============================================================================
