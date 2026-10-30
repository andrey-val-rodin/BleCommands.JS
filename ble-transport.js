import { TokenAggregator } from './token-aggregator.js';

/**
 * Provides Bluetooth communication capabilities with a connected device running
 * firmware based on the Arduino BleCommands library.
 *
 * Emits the following events:
 * - `disconnected` — fired when the device disconnects.
 * - `messagereceived` - fired when a message is received from the bluetooth device.
 *
 * A single instance represents a single connection. Create a new instance to reconnect.
 */
export class BleTransport extends EventTarget {
    /** @returns {string} UUID of the BleCommands GATT service. */
    static get SERVICE_UUID() { return 'db341fb3-8977-4c2d-ac6c-74540bd8b901'; }
    /** @returns {string} UUID of the characteristic used to write commands. */
    static get COMMAND_CHARACTERISTIC_UUID() { return 'db341fb3-8977-4c2d-ac6c-74540bd8b902'; }
    /** @returns {string} UUID of the characteristic that carries command responses. */
    static get RESPONSE_CHARACTERISTIC_UUID() { return 'db341fb3-8977-4c2d-ac6c-74540bd8b903'; }
    /** @returns {string} UUID of the characteristic that carries periodic messages. */
    static get LISTENING_CHARACTERISTIC_UUID() { return 'db341fb3-8977-4c2d-ac6c-74540bd8b904'; }

    /** @type {AbortController} Used to remove all event listeners on disconnect. */
    #controller = new AbortController();
    #encoder = new TextEncoder();
    #decoder = new TextDecoder();
    #pendingCommand = false;

    /**
     * @param {BluetoothDevice} device The device obtained from `navigator.bluetooth.requestDevice()`.
     * @param {string} [tokenDelimiter] The character that marks the end of a token.
     *   Defaults to {@link TokenAggregator.DefaultTokenDelimiter}.
     * @throws {TypeError} If `device` is not a BluetoothDevice-like object,
     *   or `tokenDelimiter` is not a single-character string.
     */
    constructor(device, tokenDelimiter = TokenAggregator.DefaultTokenDelimiter) {
        super(); // must be first: class extends EventTarget

        if (!device || typeof device !== 'object' || !('gatt' in device)) {
            throw new TypeError('BluetoothDevice object expected');
        }
        if (typeof tokenDelimiter !== 'string' || tokenDelimiter.length !== 1) {
            throw new TypeError('delimiter must be a single character string');
        }

        /** @type {BluetoothDevice} */
        this.device = device;
        /** @type {string} */
        this.tokenDelimiter = tokenDelimiter;
    }

    /**
     * Connects to the GATT server of the device, resolves characteristics
     * and subscribes to notifications.
     * @returns {Promise<void>}
     * @throws {Error} If the GATT connection fails or the required service/characteristics are missing.
     */
    async start() {
        this.#controller = new AbortController();

        this.device.addEventListener(
            'gattserverdisconnected',
            () => this.dispatchEvent(new CustomEvent('disconnected')),
            { signal: this.#controller.signal }
        );

        this.server = await this.device.gatt.connect();

        try {
            if (!await this.#loadCharacteristicsAsync()) {
                throw new Error('Unable to load characteristics');
            }
        } catch (err) {
            this.disconnect();
            throw err;
        }

        this.dispatchEvent(new CustomEvent('connected'));
    }

    /**
     * Disconnects from the device and removes all internal event listeners.
     * Safe to call multiple times.
     */
    disconnect() {
        this.#controller.abort();
        if (this.server?.connected) {
            this.server.disconnect();
        }

        this.#controller = null;
        this.server = null;
        this.commandCharacteristic = null;
        this.responseCharacteristic = null;
        this.listeningCharacteristic = null;
        this.#pendingCommand = false;
    }

    /**
     * Sends a command and waits for a response token.
     * @param {string} command
     * @param {number} [timeoutMs=1000]
     * @returns {Promise<string|null>} The response token, or null on timeout.
     */
    async sendCommand(command, timeoutMs = 1000) {
        if (!this.commandCharacteristic) {
            throw new Error('Not connected');
        }
        if (this.#pendingCommand) {
            throw new Error('The command is already being sent');
        }

        this.#pendingCommand = true;
        const aggregator = this.responseCharacteristic.tokenAggregator;

        return new Promise((resolve, reject) => {
            const onResponse = (e) => {
                cleanup();
                resolve(e.detail);
            };

            let timer = setTimeout(() => {
                cleanup();
                resolve(null);
            }, timeoutMs);

            // cleanup is idempotent: removeEventListener/clearTimeout/resolve
            // are no-ops when called again
            const cleanup = () => {
                aggregator.removeEventListener('tokenreceived', onResponse);
                clearTimeout(timer);
                this.#pendingCommand = false;
            };

            aggregator.addEventListener('tokenreceived', onResponse);

            this.commandCharacteristic
                .writeValueWithoutResponse(this.#encoder.encode(command))
                .catch((err) => {
                    cleanup();
                    reject(err);
                });
        });
    }

    /**
     * Resolves the BleCommands service and its characteristics, wires up
     * token aggregators and starts notifications.
     * @returns {Promise<boolean>} `true` on success, `false` if any characteristic is missing.
     */
    async #loadCharacteristicsAsync() {
        const service = await this.server?.getPrimaryService(BleTransport.SERVICE_UUID);
        if (!service) {
            return false;
        }

        this.commandCharacteristic = await service.getCharacteristic(BleTransport.COMMAND_CHARACTERISTIC_UUID);
        this.responseCharacteristic = await service.getCharacteristic(BleTransport.RESPONSE_CHARACTERISTIC_UUID);
        this.listeningCharacteristic = await service.getCharacteristic(BleTransport.LISTENING_CHARACTERISTIC_UUID);

        if (!this.commandCharacteristic || !this.responseCharacteristic || !this.listeningCharacteristic) {
            return false;
        }

        this.responseCharacteristic.tokenAggregator = new TokenAggregator(this.tokenDelimiter);
        this.listeningCharacteristic.tokenAggregator = new TokenAggregator(this.tokenDelimiter);

        // Re-dispatch aggregated tokens as transport-level events.
        this.listeningCharacteristic.tokenAggregator.addEventListener('tokenreceived', (e) => {
            this.dispatchEvent(new CustomEvent('messagereceived', { detail: { text: e.detail } }));
        });

        this.responseCharacteristic.addEventListener(
            'characteristicvaluechanged',
            (event) => {
                const str = this.#decoder.decode(event.target.value);
                this.responseCharacteristic.tokenAggregator.append(str);
            },
            { signal: this.#controller.signal }
        );
        this.listeningCharacteristic.addEventListener(
            'characteristicvaluechanged',
            (event) => {
                const str = this.#decoder.decode(event.target.value);
                this.listeningCharacteristic.tokenAggregator.append(str);
            },
            { signal: this.#controller.signal }
        );

        await this.responseCharacteristic.startNotifications();
        await this.listeningCharacteristic.startNotifications();

        return true;
    }
}
