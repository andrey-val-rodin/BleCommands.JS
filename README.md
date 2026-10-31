# BleCommands.JS

[![Node.js CI](https://github.com/andrey-val-rodin/BleCommands.JS/actions/workflows/node.js.yml/badge.svg)](https://github.com/andrey-val-rodin/BleCommands.JS/actions/workflows/node.js.yml)

**BleCommands.JS** is a lightweight JavaScript library for exchanging text commands with BLE devices over [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). It is the browser counterpart of the [.NET BleCommands](https://github.com/andrey-val-rodin/BleCommands) library and works out of the box with firmware built on the [Arduino companion library](https://github.com/andrey-val-rodin/BleCommands.Arduino).

Write a web page, connect to your device, and start sending commands — no native app required.

## Features

- **Text-based protocol**: Commands are human-readable, simplifying debugging.
- **Ease of use**: No need to understand the intricacies of GATT, characteristics, descriptors or buffering.
- **Runs in the browser**: Works in Chrome, Edge, Opera and Samsung Internet on desktop and Android. No build step required — the library is a plain ES module.
- **Reliability**: Automatic reassembly of fragmented packets, response waiting and timeouts.
- **Unlimited message length**: Receive UTF-8 strings of any length.
- **Ready-to-use companion**: The dedicated [library for Arduino/ESP32](https://github.com/andrey-val-rodin/BleCommands.Arduino) implements the server side of the protocol out of the box.
- **Small and dependency-free**: A single `TokenAggregator` and a single `BleTransport` — no runtime dependencies.

## Browser support

Web Bluetooth is **not** implemented in Safari (macOS/iOS) or Firefox. The library will report this via `isWebBluetoothSupported()`, but it cannot work around the browser limitation.

| Browser | Desktop | Android |
| :--- | :---: | :---: |
| Chrome | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Opera | ✅ | ✅ |
| Samsung Internet | — | ✅ |
| Safari / Firefox | ❌ | ❌ |

Web Bluetooth requires a **secure context**: `https://` or `http://localhost`. Opening an HTML file via `file://` will not work.

## Installation

```bash
npm install blecommands
```

The package is a pure ES module (`"type": "module"`). It can be used with any bundler (Vite, Webpack, Rollup) or directly in the browser via an import map (see below).

## Quick Start

If your Arduino sketch uses the [Arduino companion library](https://github.com/andrey-val-rodin/BleCommands.Arduino), the work is quite simple:

```javascript
import { requestDevice, createTransport } from 'blecommands';

// Must be called from a user gesture (e.g. a click handler).
const device = await requestDevice('My BLE device');
const transport = await createTransport(device);
const response = await transport.sendCommand('STATUS');
```

`requestDevice()` **must be the first `await` inside a click handler**. The browser rejects the request otherwise.

### Subscribing to events

`BleTransport` extends `EventTarget`, so you can use `addEventListener`:

```javascript
transport.addEventListener('messagereceived', (e) => {
    console.log('Token:', e.detail.text);
});

transport.addEventListener('disconnected', () => {
    console.log('Device disconnected');
});
```

### Disconnecting

```javascript
transport.disconnect();
```

After `disconnect()` the transport cannot be reused — create a new one with `createTransport()`.

## Using without a bundler

The library works directly in the browser. Add an import map to your HTML and import the package by name:

```html
<script type="importmap">
{
  "imports": {
    "blecommands": "https://esm.sh/blecommands"
  }
}
</script>
<script type="module">
  import { requestDevice, createTransport } from 'blecommands';
  // ...
</script>
```

Alternatively, import the module by its full CDN URL:

```javascript
import { requestDevice } from 'https://esm.sh/blecommands';
```

## API

### `isWebBluetoothSupported(): boolean`

Returns `true` if the current environment exposes the Web Bluetooth API. Safe to call in non-browser environments (returns `false`).

### `requestDevice(deviceName: string): Promise<BluetoothDevice>`

Shows the system dialog for selecting a BLE device whose name exactly matches `deviceName`. Must be called from a user-gesture handler.

Throws if Web Bluetooth is not supported.

### `createTransport(device: BluetoothDevice): Promise<BleTransport>`

Creates a `BleTransport` for the given device and connects it (GATT connection, characteristic discovery, notification subscription). Throws if the connection or discovery fails.

### `class BleTransport extends EventTarget`

| Member | Description |
| :--- | :--- |
| `start(): Promise<void>` | Connects and subscribes to notifications. Called by `createTransport()`. |
| `disconnect(): void` | Disconnects and removes all internal listeners. Rejects an in-flight command with `Disconnected`. Safe to call multiple times. |
| `sendCommand(command: string, timeoutMs = 1000): Promise<string \| null>` | Writes `command` and waits for a response token. Returns the token, or `null` on timeout. Throws if not connected, if another command is in flight, if the write fails, or if the device disconnects while waiting. |
| `device` | The underlying `BluetoothDevice`. |
| `tokenDelimiter` | The token delimiter (default `'\n'`). |

Events:

- `messagereceived` — fired for each complete token received on the listening characteristic. `e.detail.text` holds the token.
- `disconnected` — fired when the device disconnects (or `disconnect()` is called).

### `class TokenAggregator extends EventTarget`

Combines fragments of text into complete tokens delimited by a single character. Used internally by `BleTransport`, but exported for advanced scenarios and testing.

- `new TokenAggregator(delimiter = '\n')`
- `append(text: string): void` — appends a chunk and dispatches `tokenreceived` for each complete token. `e.detail` holds the token.
- `static get DefaultTokenDelimiter(): string`

## Protocol

The library is a client for the text-based command/response protocol implemented by the [Arduino companion library](https://github.com/andrey-val-rodin/BleCommands.Arduino):

- Commands and responses are UTF-8 strings terminated by a delimiter (default `'\n'`).
- The client writes a command to the **command characteristic** and waits for a token on the **response characteristic**.
- The device may also send unsolicited tokens on the **listening characteristic**; they are delivered via the `messagereceived` event.

### Correlation

`sendCommand()` returns the **first token** received on the response characteristic within `timeoutMs`. If the device can answer with a delay longer than the timeout, the late response may be picked up by the **next** `sendCommand()` call. To avoid this, either increase `timeoutMs` or include a correlation id in your own protocol.

## Examples

See the [`examples/`](examples/) folder:

- [`messaging.html`](examples/messaging.html) — two-page demo with a command selector, response display and a live log of `messagereceived` tokens.

Run the examples from a local server, for instance:

```bash
npx serve
```

Then open `http://localhost:3000/examples/messaging.html`. The device must be running the **Messaging** example firmware from the Arduino companion library.

## Related projects

- [BleCommands](https://github.com/andrey-val-rodin/BleCommands) — .NET library (MAUI, WPF, WinForms).
- [BleCommands.Arduino](https://github.com/andrey-val-rodin/BleCommands.Arduino) — Arduino/ESP32 companion library.
