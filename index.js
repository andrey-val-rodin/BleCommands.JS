import { BleTransport } from './ble-transport.js';

/**
 * Determines whether Web Bluetooth API is available in the current browser.
 * @returns `true` if Web Bluetooth is available.
 */
export function isWebBluetoothSupported() {
    return typeof navigator === 'undefined'
        ? false
        : typeof navigator.bluetooth?.requestDevice === 'function';
}

/**
 * Displays the system dialog for selecting a BLE device.
 * Must be called directly from a click handler (user gesture).
 * @param {string} deviceName - Name of the Bluetooth LE device.
 * @returns {Promise<BluetoothDevice>}
 */
export function requestDevice(deviceName) {
    return navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: [BleTransport.SERVICE_UUID]
    });
}

/**
 * Creates BleTransport object.
 * @param {BluetoothDevice} device Bluetooth LE device.
 * @returns {BleTransport}
 */
export async function createTransport(device) {
    let transport = new BleTransport(device);
    await transport.connect();
    return transport;
}
