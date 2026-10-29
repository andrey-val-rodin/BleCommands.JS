import { BleTransport } from './ble-transport.js';

/**
 * Determines whether the Web Bluetooth API is available in the current browser.
 * Safe to call in non-browser environments (returns `false`).
 * @returns {boolean}
 */
export function isWebBluetoothSupported() {
    return typeof navigator === 'undefined'
        ? false
        : typeof navigator.bluetooth?.requestDevice === 'function';
}

/**
 * Displays the system dialog for selecting a BLE device.
 * Must be called directly from a user-gesture handler (e.g. a click listener);
 * otherwise the browser rejects the request.
 * @param {string} deviceName Exact BLE device name (must match the name set in the Arduino sketch).
 * @returns {Promise<BluetoothDevice>}
 * @throws {Error} If Web Bluetooth is not supported in this browser.
 */
export function requestDevice(deviceName) {
    if (!isWebBluetoothSupported()) {
        throw new Error('Web Bluetooth is not supported in this browser');
    }

    return navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: [BleTransport.SERVICE_UUID]
    });
}

/**
 * Creates a {@link BleTransport} for the given device and connects it.
 * @param {BluetoothDevice} device The device obtained from {@link requestDevice}.
 * @returns {Promise<BleTransport>} A connected transport.
 * @throws {Error} If the connection or characteristic discovery fails.
 */
export async function createTransport(device) {
    const transport = new BleTransport(device);
    await transport.start();
    return transport;
}
