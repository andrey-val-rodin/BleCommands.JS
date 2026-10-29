/**
 * Combines fragments of text into complete tokens delimited by the specified character.
 *
 * Extends EventTarget so consumers can subscribe with addEventListener("tokenreceived", ...).
 */
export class TokenAggregator extends EventTarget {
    /**
     * The default token delimiter character (newline).
     */
    static DefaultTokenDelimiter = "\n";

    /**
     * @param {string} [delimiter] The character that marks the end of a token.
     *   Defaults to TokenAggregator.DefaultTokenDelimiter.
     * @throws {TypeError} Thrown when `delimiter` is wrong.
     */
    constructor(delimiter = TokenAggregator.DefaultTokenDelimiter) {
        super();

        if (typeof delimiter !== "string" || delimiter.length !== 1) {
            throw new TypeError("delimiter must be a single character string");
        }

        this.tokenDelimiter = delimiter;
        this._buffer = "";
    }

    /**
     * Appends a chunk of text to the internal buffer and dispatches "tokenreceived"
     * events for each complete token found.
     * @param {string} text Text fragment to append. Cannot be null/undefined.
     * @throws {TypeError} Thrown when `text` is null or undefined.
     */
    append(text) {
        if (text == null) {
            throw new TypeError("text cannot be null or undefined");
        }
        if (typeof text !== "string") {
            throw new TypeError("text must be a string");
        }

        let start = 0;
        while (start < text.length) {
            const delimiterIndex = text.indexOf(this.tokenDelimiter, start);
            if (delimiterIndex < 0) {
                this._buffer += text.slice(start);
                break;
            }

            this._buffer += text.slice(start, delimiterIndex);
            const token = this._buffer;
            this._buffer = "";

            this.dispatchEvent(new CustomEvent("tokenreceived", { detail: token }));
            start = delimiterIndex + 1;
        }
    }
}
