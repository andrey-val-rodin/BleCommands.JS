import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TokenAggregator } from '../token-aggregator.js';

describe('TokenAggregator', () => {
    const D = TokenAggregator.DefaultTokenDelimiter;
    let aggregator;
    let tokens;
    let handler;

    beforeEach(() => {
        aggregator = new TokenAggregator();
        tokens = [];
        handler = (e) => tokens.push(e.detail);
        aggregator.addEventListener('tokenreceived', handler);
    });

    afterEach(() => {
        aggregator.removeEventListener('tokenreceived', handler);
    });

    it('append_non_string_throws_TypeError', () => {
        expect(() => aggregator.append(null)).toThrow(TypeError);
        expect(() => aggregator.append(undefined)).toThrow(TypeError);
        expect(() => aggregator.append(123)).toThrow(TypeError);
    });

    it('append_one_token_valid', () => {
        const token = 'Token 1';
        aggregator.append(token + D);

        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toBe(token);
    });

    it('append_unicode_token_valid', () => {
        const token = 'Русский токен🔥';
        aggregator.append(token + D);

        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toBe(token);
    });

    it('append_large_token_valid', () => {
        const token = 'x'.repeat(1024 * 1024);
        aggregator.append(token + D);

        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toBe(token);
    });

    it('append_first_empty_token_valid', () => {
        aggregator.append(D);
        aggregator.append('Token 2' + D);
        aggregator.append('Token 3' + D);

        expect(tokens).toEqual(['', 'Token 2', 'Token 3']);
    });

    it('append_last_empty_token_valid', () => {
        aggregator.append('Token 1' + D);
        aggregator.append('Token 2' + D);
        aggregator.append(D);

        expect(tokens).toEqual(['Token 1', 'Token 2', '']);
    });

    it('append_empty_token_in_middle_valid', () => {
        aggregator.append('Token 1' + D);
        aggregator.append(D);
        aggregator.append('Token 3' + D);

        expect(tokens).toEqual(['Token 1', '', 'Token 3']);
    });

    it('append_three_empty_tokens_valid', () => {
        aggregator.append(D);
        aggregator.append(D);
        aggregator.append(D);

        expect(tokens).toEqual(['', '', '']);
    });

    it('append_disrupted_chain_valid', () => {
        aggregator.append(`Token 1${D}Token 2`);
        aggregator.append(`${D}Token 3${D}`);

        expect(tokens).toEqual(['Token 1', 'Token 2', 'Token 3']);
    });

    it('append_multiple_tokens_valid', () => {
        aggregator.append(`Token 1${D}Token 2${D}Token 3${D}`);

        expect(tokens).toEqual(['Token 1', 'Token 2', 'Token 3']);
    });

    it('append_long_disrupted_chain_valid', () => {
        let chain = '';
        for (let i = 0; i < 100; i++) chain += `Token ${i}${D}`;

        for (const ch of chain) aggregator.append(ch);

        expect(tokens).toHaveLength(100);
        for (let i = 0; i < 100; i++) {
            expect(tokens[i]).toBe(`Token ${i}`);
        }
    });

    it('custom_delimiter_valid', () => {
        const custom = new TokenAggregator('\x04');
        const received = [];
        custom.addEventListener('tokenreceived', (e) => received.push(e.detail));

        custom.append('A\x04B\x04');

        expect(received).toEqual(['A', 'B']);
    });
});
