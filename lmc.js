export class LMC {
	constructor(ioHandlers = {}) {
		this.memory = new Array(100).fill(0);
		this.accumulator = 0;
		this.programCounter = 0;
		this.instructionRegister = 0;
		this.halted = false;
		this.waitingForInput = false;
		this.onState = ioHandlers.onState || (() => {});
		this.onOutput = ioHandlers.onOutput || (() => {});
		this.onInputRequest = ioHandlers.onInputRequest || (() => {});
	}

	reset() {
		this.memory.fill(0);
		this.accumulator = 0;
		this.programCounter = 0;
		this.instructionRegister = 0;
		this.halted = false;
		this.waitingForInput = false;
		this.onState(this.getState());
	}

	load(programArray) {
		this.reset();
		for (let i = 0; i < Math.min(100, programArray.length); i++) {
			this.memory[i] = this.normalize(programArray[i]);
		}
		this.onState(this.getState());
	}

	normalize(value) {
		let v = Number(value) | 0;
		if (v < 0) v = (1000 + (v % 1000)) % 1000;
		return v % 1000;
	}

	read(address) { return this.memory[address % 100]; }
	write(address, value) { this.memory[address % 100] = this.normalize(value); }

	getState() {
		return {
			memory: [...this.memory],
			accumulator: this.accumulator,
			programCounter: this.programCounter,
			instructionRegister: this.instructionRegister,
			halted: this.halted,
			waitingForInput: this.waitingForInput,
		};
	}

	step(inbox) {
		if (this.halted) return { status: "halted" };
		if (this.waitingForInput) {
			if (inbox && inbox.length > 0) {
				const value = Number(inbox.shift());
				this.accumulator = this.normalize(value);
				this.waitingForInput = false;
			} else {
				this.onInputRequest();
				return { status: "waiting" };
			}
		}

		this.instructionRegister = this.read(this.programCounter);
		this.programCounter = (this.programCounter + 1) % 100;

		const opcode = Math.floor(this.instructionRegister / 100);
		const addr = this.instructionRegister % 100;

		switch (opcode) {
			case 0: // 000 HLT or DAT 0
				this.halted = true;
				break;
			case 1: // ADD
				this.accumulator = this.normalize(this.accumulator + this.read(addr));
				break;
			case 2: // SUB
				this.accumulator = this.normalize(this.accumulator - this.read(addr));
				break;
			case 3: // STA
				this.write(addr, this.accumulator);
				break;
			case 5: // LDA
				this.accumulator = this.read(addr);
				break;
			case 6: // BRA
				this.programCounter = addr;
				break;
			case 7: // BRZ
				if (this.accumulator === 0) this.programCounter = addr;
				break;
			case 8: // BRP
				if (this.accumulator >= 0) this.programCounter = addr;
				break;
			case 9: // IO
				if (this.instructionRegister === 901) { // IN
					if (inbox && inbox.length > 0) {
						const value = Number(inbox.shift());
						this.accumulator = this.normalize(value);
					} else {
						this.programCounter = (this.programCounter + 99) % 100; // step back
						this.waitingForInput = true;
						this.onInputRequest();
						return { status: "waiting" };
					}
				} else if (this.instructionRegister === 902) { // OUT
					this.onOutput(this.accumulator);
				} else {
					// 9xy custom? Ignore
				}
				break;
			default:
				// DAT or unknown; treat as HLT safeguard
				this.halted = true;
		}

		this.onState(this.getState());
		return { status: this.halted ? "halted" : "ok" };
	}
}
