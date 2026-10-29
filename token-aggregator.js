/**
 * Combines fragments of text into complete tokens delimited by the specified character.
 *
 * Extends EventTarget so consumers can subscribe with `addEventListener('tokenreceived', ...)`.
 */
export class TokenAggregator extends EventTarget {
    /** The default token delimiter (newline). @type {string} */
    static get DefaultTokenDelimiter() { return '\n'; }

    #buffer = '';

    /**
     * @param {string} [delimiter] The character that marks the end of a token.
     *   Must be a single-character string. Defaults to {@link TokenAggregator.DefaultTokenDelimiter}.
     * @throws {TypeError} If `delimiter` is not a single-character string.
     */
    constructor(delimiter = TokenAggregator.DefaultTokenDelimiter) {
        super();
        if (typeof delimiter !== 'string' || delimiter.length !== 1) {
            throw new TypeError('delimiter must be a single character string');
        }
        /** @type {string} */
        this.tokenDelimiter = delimiter;
    }

    /**
     * Appends a chunk of text to the internal buffer and dispatches a
     * `tokenreceived` event for every complete token found.
     *
     * An incomplete tail stays buffered until the next call.
     *
     * @param {string} text Text fragment to append.
     * @throws {TypeError} If `text` is not a string.
     */
    append(text) {
        if (typeof text !== 'string') {
            throw new TypeError('text must be a string');
        }

        let start = 0;
        while (start < text.length) {
            const delimiterIndex = text.indexOf(this.tokenDelimiter, start);
            if (delimiterIndex < 0) {
                this.#buffer += text.slice(start);
                break;
            }
            this.#buffer += text.slice(start, delimiterIndex);
            const token = this.#buffer;
            this.#buffer = '';
            this.dispatchEvent(new CustomEvent('tokenreceived', { detail: token }));
            start = delimiterIndex + 1;
        }
    }
}
