#include <BLECommands.h>

BLECommandsServer server;

String generateTestString() {
  const int SIZE = 50 * 1024;
  char* buffer = (char*)malloc(SIZE + 1);

  if (!buffer) return String();

  int pos = 0;
  int i = 0;
  int cnt = 0;

  const unsigned char cyrillicBase = 0x90;

  const char* chineseChars[] = {
    "\xE4\xB8\xAD", // 中
    "\xE6\x96\x87", // 文
    "\xE5\x9B\xBD", // 国
    "\xE4\xBA\xBA", // 人
    "\xE6\xB0\x91", // 民
    "\xE5\xA4\xA7", // 大
    "\xE5\xAD\xA6", // 学
    "\xE7\x94\x9F"  // 生
  };
  const size_t CHINESE_COUNT = 8;

  while (pos < SIZE) {
    int remainder = i % 4;
    int count = cnt % 3;
    cnt++;
    switch (remainder) {
      case 0: { // ASCII - 1 byte
        for (int j = 0; j <= count; j++)
        {
          if (pos + 1 <= SIZE) {
            buffer[pos++] = static_cast<char>(32 + (i++ % 95));
          }
        }
        break;
      }
      case 1: { // Russian - 2 bytes
        for (int j = 0; j <= count; j++)
        {
          if (pos + 2 <= SIZE) {
            unsigned char cyrillic = cyrillicBase + (i++ % 32);
            buffer[pos++] = static_cast<char>(0xD0);
            buffer[pos++] = static_cast<char>(cyrillic);
          }
        }
        break;
      }

      case 2: { // Chinese character - 3 bytes
        for (int j = 0; j <= count; j++)
        {
          if (pos + 3 <= SIZE) {
            const char* ch = chineseChars[i++ % CHINESE_COUNT];
            buffer[pos++] = ch[0];
            buffer[pos++] = ch[1];
            buffer[pos++] = ch[2];
          }
        }
        break;
      }

      case 3: { // Emoji - 4 bytes
        for (int j = 0; j <= count; j++)
        {
          if (pos + 4 <= SIZE) {
            const char* fire = "\xF0\x9F\x94\xA5";
            buffer[pos++] = fire[0];
            buffer[pos++] = fire[1];
            buffer[pos++] = fire[2];
            buffer[pos++] = fire[3];
            i++;
          }
        }
        break;
      }
    }
  }

  buffer[SIZE] = '\0';
  String result = String(buffer);
  free(buffer);

  return result;
}
String longText = generateTestString();

void setup() {
  Serial.begin(115200);
  while (!Serial);

  if (!server.begin("BLECommands device")) {
    Serial.println("Starting BLECommands server failed");
    while (true);
  }

  server
    .onCommand("ECHO", [](const String& command, const String& args) -> String {
      String text = args.isEmpty() ? command : command + " " + args;
      Serial.println(text);
      return text;})
    .onCommand("LONG_RESPONSE", [](const String& command, const String& args) -> String {
      return longText;})
    .onCommand("LONG_MESSAGE", [](const String& command, const String& args) -> String {
      server.send(longText);
      return "OK";});
}

void loop() {
  server.poll();
}
