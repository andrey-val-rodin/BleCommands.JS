import { TokenAggregator } from './token-aggregator.js';

/**
 * Provides Bluetooth communication capabilities with a connected device running
 * firmware based on the Arduino BleCommands library.
 */
export class BleTransport extends EventTarget {
    static get SERVICE_UUID() {
        return 'db341fb3-8977-4c2d-ac6c-74540bd8b901';
    }
    static get COMMAND_CHARACTERISTIC_UUID() {
        return 'db341fb3-8977-4c2d-ac6c-74540bd8b902';
    }
    static get RESPONSE_CHARACTERISTIC_UUID() {
        return 'db341fb3-8977-4c2d-ac6c-74540bd8b903';
    }
    static get LISTENING_CHARACTERISTIC_UUID() {
        return 'db341fb3-8977-4c2d-ac6c-74540bd8b904';
    }
    
    #controller = new AbortController();

    /**
     * Initializes a new instance of the `BleTransport` object.
     * @param {BluetoothDevice} [device] The device.
     * @param {string} [delimiter] The character that marks the end of a token.
     *   Defaults to TokenAggregator.DefaultTokenDelimiter.
     * @throws {TypeError} Thrown when `device` is not valid object or `tokenDelimiter` is wrong.
     */
    constructor(device, tokenDelimiter = TokenAggregator.DefaultTokenDelimiter) {
        if (!device || typeof device !== 'object' || !('gatt' in device)) {
            throw new TypeError('BluetoothDevice object expected');
        }
        if (typeof tokenDelimiter !== "string" || tokenDelimiter.length !== 1) {
            throw new TypeError("delimiter must be a single character string");
        }

        super();
        this.device = device;
        this.tokenDelimiter = tokenDelimiter;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }

    async connect() {
        this.device.addEventListener('gattserverdisconnected', () => {
            this.dispatchEvent(new CustomEvent('disconnected'))},
            { signal: this.#controller.signal });

        this.server = await this.device.gatt.connect();
        if (!await this.#loadCharacteristicsAsync())
            throw new Error('Unable to load characteristics');
    }

    disconnect() {
        this.#controller.abort();

        if (this.server?.connected) {
            this.server.disconnect();
        }
    }

    async #loadCharacteristicsAsync() {
        const service = await this.server?.getPrimaryService(BleTransport.SERVICE_UUID);
        this.commandCharacteristic = await service?.getCharacteristic(BleTransport.COMMAND_CHARACTERISTIC_UUID);
        this.responseCharacteristic = await service?.getCharacteristic(BleTransport.RESPONSE_CHARACTERISTIC_UUID);
        this.listeningCharacteristic = await service?.getCharacteristic(BleTransport.LISTENING_CHARACTERISTIC_UUID);

        if (!this.commandCharacteristic || !this.responseCharacteristic || !this.listeningCharacteristic) {
            return false;
        }

        this.responseCharacteristic.tokenAggregator = new TokenAggregator(this.tokenDelimiter);
        this.listeningCharacteristic.tokenAggregator = new TokenAggregator(this.tokenDelimiter);

        this.responseCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const str = decoder.decode(event.target.value);
            this.responseCharacteristic.tokenAggregator.Append(str); },
            { signal: this.#controller.signal });
        this.listeningCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const str = decoder.decode(event.target.value);
            this.listeningCharacteristic.tokenAggregator.Append(str); },
            { signal: this.#controller.signal });

        await this.responseCharacteristic.startNotifications();
        await this.listeningCharacteristic.startNotifications();

        return true;
    }
}