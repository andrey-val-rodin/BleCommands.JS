import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BleTransport } from '../ble-transport.js';
import { TokenAggregator } from '../token-aggregator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal BluetoothDevice mock: an EventTarget with a `gatt` object.
 * `gatt.connect()` resolves to itself; `gatt.disconnect()` flips `connected`.
 */
function createMockDevice() {
    const device = new EventTarget();
    device.gatt = {
        connected: false,
        connect: async () => {
            device.gatt.connected = true;
            return device.gatt;
        },
        disconnect: () => {
            device.gatt.connected = false;
        }
    };
    return device;
}

/**
 * A characteristic mock with an attached TokenAggregator, notification support
 * and write capability. Extends EventTarget so #loadCharacteristicsAsync can
 * call addEventListener() on it.
 */
function createMockCharacteristic() {
    const characteristic = new EventTarget();
    characteristic.tokenAggregator = new TokenAggregator();
    characteristic.startNotifications = async () => {};
    characteristic.writeValueWithoutResponse = async () => {};
    return characteristic;
}

/**
 * Builds a transport with all characteristics injected, bypassing start().
 * This is the state sendCommand() expects.
 */
function createConnectedTransport() {
    const device = createMockDevice();
    const transport = new BleTransport(device);

    transport.commandCharacteristic = createMockCharacteristic();
    transport.responseCharacteristic = createMockCharacteristic();
    transport.listeningCharacteristic = createMockCharacteristic();
    transport.server = device.gatt;

    return { device, transport };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BleTransport', () => {
    let transport;

    beforeEach(() => {
        ({ transport } = createConnectedTransport());
    });

    afterEach(() => {
        vi.useRealTimers();
        transport?.disconnect();
    });

    // --- sendCommand: happy path ------------------------------------------

    it('sendCommand_resolves_with_response_token', async () => {
        const promise = transport.sendCommand('PING');

        // Emulate the device answering on the response characteristic.
        transport.responseCharacteristic.tokenAggregator.append('OK\n');

        await expect(promise).resolves.toBe('OK');
    });

    it('sendCommand_resolves_with_first_of_multiple_tokens', async () => {
        const promise = transport.sendCommand('STATUS');

        transport.responseCharacteristic.tokenAggregator.append('OK\nEXTRA\n');

        await expect(promise).resolves.toBe('OK');
    });

    it('sendCommand_writes_command_to_command_characteristic', async () => {
        const writeSpy = vi.spyOn(transport.commandCharacteristic, 'writeValueWithoutResponse');

        const promise = transport.sendCommand('PING');
        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await promise;

        expect(writeSpy).toHaveBeenCalledOnce();
        const bytes = writeSpy.mock.calls[0][0];
        expect(new TextDecoder().decode(bytes)).toBe('PING');
    });

    // --- sendCommand: timeout ---------------------------------------------

    it('sendCommand_returns_null_on_timeout', async () => {
        vi.useFakeTimers();

        const promise = transport.sendCommand('PING', 1000);

        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).resolves.toBeNull();
    });

    it('sendCommand_response_before_timeout_wins_over_timer', async () => {
        vi.useFakeTimers();

        const promise = transport.sendCommand('PING', 1000);

        // Answer arrives before the timer fires.
        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).resolves.toBe('OK');
    });

    // --- sendCommand: concurrent calls ------------------------------------

    it('sendCommand_throws_when_another_command_is_in_flight', async () => {
        const first = transport.sendCommand('PING', 5000);

        await expect(transport.sendCommand('STATUS')).rejects.toThrow(
            'The command is already being sent'
        );

        // Let the first one finish so afterEach can clean up.
        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await first;
    });

    it('sendCommand_can_be_called_again_after_previous_finished', async () => {
        const first = transport.sendCommand('PING');
        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await first;

        const second = transport.sendCommand('STATUS');
        transport.responseCharacteristic.tokenAggregator.append('READY\n');

        await expect(second).resolves.toBe('READY');
    });

    // --- sendCommand: errors ----------------------------------------------

    it('sendCommand_rejects_when_not_connected', async () => {
        transport.commandCharacteristic = null;

        await expect(transport.sendCommand('PING')).rejects.toThrow('Not connected');
    });

    it('sendCommand_rejects_when_write_fails', async () => {
        const writeError = new Error('write failed');
        transport.commandCharacteristic.writeValueWithoutResponse = async () => {
            throw writeError;
        };

        await expect(transport.sendCommand('PING')).rejects.toThrow('write failed');
    });

    it('sendCommand_can_be_called_again_after_write_error', async () => {
        transport.commandCharacteristic.writeValueWithoutResponse = async () => {
            throw new Error('write failed');
        };

        await expect(transport.sendCommand('PING')).rejects.toThrow('write failed');

        // Restore a working write and verify the pending flag was reset.
        transport.commandCharacteristic.writeValueWithoutResponse = async () => {};
        const promise = transport.sendCommand('PING');
        transport.responseCharacteristic.tokenAggregator.append('OK\n');

        await expect(promise).resolves.toBe('OK');
    });

    // --- sendCommand: disconnect while waiting ----------------------------

    it('disconnect_rejects_in_flight_command', async () => {
        const promise = transport.sendCommand('PING', 5000);

        transport.disconnect();

        await expect(promise).rejects.toThrow('Disconnected');
    });

    it('disconnect_does_not_affect_completed_command', async () => {
        const promise = transport.sendCommand('PING');
        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await expect(promise).resolves.toBe('OK');

        // Should not throw and must not produce an unhandled rejection.
        expect(() => transport.disconnect()).not.toThrow();
    });

    // --- disconnect: idempotency ------------------------------------------

    it('disconnect_is_idempotent', () => {
        expect(() => transport.disconnect()).not.toThrow();
        expect(() => transport.disconnect()).not.toThrow();
        expect(() => transport.disconnect()).not.toThrow();
    });

    it('disconnect_clears_characteristics', () => {
        transport.disconnect();

        expect(transport.commandCharacteristic).toBeNull();
        expect(transport.responseCharacteristic).toBeNull();
        expect(transport.listeningCharacteristic).toBeNull();
        expect(transport.server).toBeNull();
    });

    // --- disconnect event -------------------------------------------------

    it('dispatch_disconnected_when_device_fires_gattserverdisconnected', async () => {
        // start() wires the listener; we only need the listener itself,
        // so call start() with a gatt that resolves, then fire the event.
        const freshDevice = createMockDevice();
        const freshTransport = new BleTransport(freshDevice);

        // Replace #loadCharacteristicsAsync side effects by injecting mocks
        // after start() — start() will fail on getPrimaryService, so instead
        // we only verify the listener wiring by calling start() on a device
        // whose gatt.connect resolves and whose service lookup is stubbed.
        freshDevice.gatt.connect = async () => {
            freshDevice.gatt.connected = true;
            return {
                connected: true,
                getPrimaryService: async () => ({
                    getCharacteristic: async () => createMockCharacteristic()
                }),
                disconnect: () => { freshDevice.gatt.connected = false; }
            };
        };

        const listener = vi.fn();
        freshTransport.addEventListener('disconnected', listener);

        await freshTransport.start();
        freshDevice.dispatchEvent(new Event('gattserverdisconnected'));

        expect(listener).toHaveBeenCalledOnce();
        freshTransport.disconnect();
    });

    // --- cleanup idempotency ----------------------------------------------

    it('cleanup_after_response_does_not_resolve_twice_on_timeout', async () => {
        vi.useFakeTimers();
        const promise = transport.sendCommand('PING', 1000);

        transport.responseCharacteristic.tokenAggregator.append('OK\n');
        await vi.advanceTimersByTimeAsync(1000);

        // The promise resolved with 'OK', not with null from the timer.
        await expect(promise).resolves.toBe('OK');
    });
});
