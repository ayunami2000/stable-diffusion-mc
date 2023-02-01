/**
 * Split a string by character index
 *
 * @param {string} input
 * @param {number} index Character index, 0-indexed
 * @returns {string[]} The two output chunks
 */
function splitByIndex(input, index) {
	if (index < 0 || index >= input.length) {
		throw new Error(`Character index ${index} out of range`);
	}
	return [input.substr(0, index), input.substr(index)];
}

/**
 * Split a string by line index and character index
 *
 * @param {string} input
 * @param {number} lineIndex Line index, 0-indexed
 * @param {number} charIndex Character index, 0-indexed
 * @returns {string[]} The two output chunks
 */
function splitByLineAndChar(input, lineIndex, charIndex) {
	if (lineIndex < 0) {
		throw new Error(`Line index ${lineIndex} out of range`);
	}
	if (charIndex < 0) {
		throw new Error(`Character index ${charIndex} out of range`);
	}

	// Find the start of the line we are interested in
	let lineStartIndex = 0;
	for (let l = lineIndex; l > 0; l--) {
		lineStartIndex = input.indexOf('\n', lineStartIndex);
		if (lineStartIndex === -1) {
			throw new Error(`Line index ${lineIndex} out of range`);
		}
		lineStartIndex++;
	}

	// Check the character number we want is within this line
	const nextNl = input.indexOf('\n', lineStartIndex);
	if (lineStartIndex + charIndex >= input.length || nextNl !== -1 && nextNl <= lineStartIndex + charIndex) {
		throw new Error(`Character index ${charIndex} out of range for line ${lineIndex}`);
	}

	return splitByIndex(input, lineStartIndex + charIndex);
}

/**
 * List of regexes matching errors for unexpected characters after JSON data
 *
 * First placeholder: line number, 1-indexed
 * Second placeholder: character number, 1-indexed
 * Third placeholder: overall character index, 0-indexed
 */
const ERROR_REGEXES = [
	/^()()Unexpected token { in JSON at position (\d+)$/, // Node 8, Chrome 69
	/^JSON.parse: unexpected non-whitespace character after JSON data at line (\d+) column (\d+) of the JSON data()$/, // Firefox 62
	/^()()Unexpected non-whitespace character after JSON at position (\d+)$/ // Node 19
];

/**
 * Parse a string of multiple JSON objects
 *
 * @param {string} input String with zero or more JSON objects in series,
 *                       possibly separated by whitespace
 * @param {Object} [options] Options:
 * @param {boolean} [options.partial] Don't throw an error if the input ends
 *                                    partway through an object. Instead add a
 *                                    property `remainder` to the returned array
 *                                    with the remaining partial JSON string.
 *                                    Default: false
 * @param {string[]} [acc] Accumulator for internal use
 * @returns {Object[]} Array of objects
 */
function jsonMultiParse(input, options = {}, acc = []) {
	if (options.partial) {
		acc.remainder = '';
	}

	if (input.trim().length === 0) {
		return acc;
	}

	try {
		acc.push(JSON.parse(input));
		return acc;
	} catch (error) {
		let match = null;
		for (const regex of ERROR_REGEXES) {
			if (match = error.message.match(regex)) {
				break;
			}
		}
		if (!match) {
			if (options.partial) {
				acc.remainder = input;
				return acc;
			}
			throw error;
		}

		const chunks = match[3]
			? splitByIndex(input, parseInt(match[3], 10))
			: splitByLineAndChar(input, parseInt(match[1], 10) - 1, parseInt(match[2], 10) - 1);

		acc.push(JSON.parse(chunks[0]));
		return jsonMultiParse(chunks[1], options, acc);
	}
}

module.exports = jsonMultiParse;
