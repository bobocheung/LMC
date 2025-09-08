const MNEMONIC_TO_OPCODE = new Map([
	["ADD", 100],
	["SUB", 200],
	["STA", 300],
	["LDA", 500],
	["BRA", 600],
	["BRZ", 700],
	["BRP", 800],
	["IN", 901],
	["OUT", 902],
	["HLT", 0],
]);

export function assemble(source) {
	const lines = source.split(/\r?\n/);
	const cleaned = [];

	for (const raw of lines) {
		const noComment = raw.replace(/;.*/, "");
		if (noComment.trim().length === 0) continue;
		cleaned.push(noComment);
	}

	const symbol = new Map();
	let locationCounter = 0;

	// Pass 1: collect labels
	for (const line of cleaned) {
		const parts = tokenize(line);
		if (parts.label) {
			if (symbol.has(parts.label)) throw new Error(`重复标签: ${parts.label}`);
			symbol.set(parts.label, locationCounter);
		}
		locationCounter += 1;
		if (locationCounter > 100) throw new Error("程序过长，超过 100 条指令");
	}

	// Pass 2: encode
	const program = [];
	locationCounter = 0;
	for (const line of cleaned) {
		const { label, mnemonic, operand } = tokenize(line);
		let word = 0;
		if (!mnemonic) {
			word = 0;
		} else if (mnemonic === "DAT") {
			const value = operand ? parseNumberOrSymbol(operand, symbol) : 0;
			word = normalize(value);
		} else {
			const base = MNEMONIC_TO_OPCODE.get(mnemonic);
			if (base === undefined) throw new Error(`未知助记符: ${mnemonic}`);
			if (base >= 900) {
				word = base; // IN/OUT/HLT
			} else if (base === 0) {
				word = 0; // HLT
			} else {
				const addr = operand ? parseNumberOrSymbol(operand, symbol) : 0;
				if (addr < 0 || addr > 99) throw new Error(`地址越界: ${addr}`);
				word = base + addr;
			}
		}
		program.push(word);
		locationCounter += 1;
	}

	return program;
}

function tokenize(line) {
	// Format: [LABEL] MNEMONIC [OPERAND]
	const bits = line.trim().split(/\s+/);
	let label = null, mnemonic = null, operand = null;
	if (bits.length === 0) return { label, mnemonic, operand };
	if (bits.length >= 1) {
		if (isLabel(bits[0])) {
			label = sanitizeLabel(bits[0]);
			bits.shift();
		}
	}
	if (bits.length >= 1) {
		mnemonic = bits[0].toUpperCase();
		bits.shift();
	}
	if (bits.length >= 1) {
		operand = bits[0];
	}
	return { label, mnemonic, operand };
}

function isLabel(token) {
	// If token is not a known mnemonic and not a number, treat as label
	const upper = token.toUpperCase();
	if (upper === "DAT") return true; // allow: X DAT 5
	if (MNEMONIC_TO_OPCODE.has(upper)) return false;
	if (/^[-+]?\d+$/.test(token)) return false;
	return true;
}

function sanitizeLabel(token) {
	return token.replace(/:$/, "");
}

function parseNumberOrSymbol(token, symbol) {
	if (/^[-+]?\d+$/.test(token)) return Number(token) | 0;
	const key = token.replace(/:$/, "");
	if (!symbol.has(key)) throw new Error(`未定义的标签: ${token}`);
	return symbol.get(key);
}

function normalize(value) {
	let v = Number(value) | 0;
	if (v < 0) v = (1000 + (v % 1000)) % 1000;
	return v % 1000;
}
