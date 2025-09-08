import { LMC } from './lmc.js';
import { assemble } from './assembler.js';

const ui = {
	editor: document.getElementById('editor'),
	pc: document.getElementById('pc'),
	acc: document.getElementById('acc'),
	ir: document.getElementById('ir'),
	adr: document.getElementById('adr'),
	status: document.getElementById('status'),
	memory: document.getElementById('memory'),
	btnAssemble: document.getElementById('btn-assemble'),
	btnLoad: document.getElementById('btn-load'),
	btnStep: document.getElementById('btn-step'),
	btnRun: document.getElementById('btn-run'),
	btnReset: document.getElementById('btn-reset'),
	speed: document.getElementById('speed'),
	inboxInput: document.getElementById('inbox-input'),
	btnInboxAdd: document.getElementById('btn-inbox-add'),
	btnInboxClear: document.getElementById('btn-inbox-clear'),
	inboxList: document.getElementById('inbox-list'),
	outputList: document.getElementById('output-list'),
	listing: document.getElementById('listing'),
	symbolsTable: document.getElementById('symbols-table'),
	examples: document.getElementById('examples'),
	btnLoadExample: document.getElementById('btn-load-example'),
	btnSave: document.getElementById('btn-save'),
	btnLoadSaved: document.getElementById('btn-load-saved'),
	btnExport: document.getElementById('btn-export'),
	btnImport: document.getElementById('btn-import'),
	btnHelp: document.getElementById('btn-help'),
	helpModal: document.getElementById('help-modal'),
	helpClose: document.getElementById('help-close'),
	helpBody: document.getElementById('help-body'),
};

let inbox = [];
let outbox = [];
let assembled = [];
let listingLines = [];
let breakpoints = new Set();
let symbolTable = [];
let runTimer = null;
let lastState = null;

const cpu = new LMC({
	onState: (s) => {
		animateStateChanges(lastState, s);
		render(s);
		lastState = s;
	},
	onOutput: (value) => {
		outbox.push(value);
		animateFlow(ui.adr, ui.outputList, value);
		renderIO();
	},
	onInputRequest: () => {
		ui.status.textContent = '等待輸入…';
	}
});

function render(state) {
	const s = state || cpu.getState();
	ui.pc.textContent = format3(s.programCounter);
	ui.acc.textContent = format3(s.accumulator);
	ui.ir.textContent = format3(s.instructionRegister);
	const adr = s.instructionRegister % 100;
	ui.adr.textContent = String(adr).padStart(2, '0');
	ui.status.textContent = s.halted ? '已停止' : (s.waitingForInput ? '等待輸入' : '執行/就緒');
	renderMemory(s);
	highlightListing(s.programCounter);
}

function renderMemory(state) {
	const grid = ui.memory;
	if (grid.childElementCount === 0) {
		for (let i = 0; i < 100; i++) {
			const cell = document.createElement('div');
			cell.className = 'memory-cell';
			cell.setAttribute('role', 'gridcell');
			cell.dataset.addr = String(i);
			cell.title = `位址 ${i}`;
			cell.addEventListener('click', () => editMemoryCell(cell, i));
			grid.appendChild(cell);
		}
	}
	for (let i = 0; i < 100; i++) {
		const cell = grid.children[i];
		cell.textContent = format3(state.memory[i]);
		cell.classList.toggle('active', i === state.programCounter);
	}
}

function renderIO() {
	if (ui.inboxList) {
		ui.inboxList.innerHTML = '';
		inbox.forEach((v, idx) => {
			const li = document.createElement('li');
			li.textContent = `${idx}: ${format3(v)}`;
			ui.inboxList.appendChild(li);
		});
	}
	ui.outputList.innerHTML = '';
	outbox.forEach((v, idx) => {
		const li = document.createElement('li');
		li.textContent = `${idx}: ${format3(v)}`;
		ui.outputList.appendChild(li);
	});
}

function format3(n) {
	const v = Number(n) | 0;
	return String(((v % 1000) + 1000) % 1000).padStart(3, '0');
}

ui.btnInboxAdd?.addEventListener('click', () => {
	const val = Number(ui.inboxInput.value);
	if (Number.isFinite(val) && val >= -999 && val <= 999) {
		inbox.push(val);
		ui.inboxInput.value = '';
		renderIO();
	}
	ui.inboxInput.focus();
});
ui.btnInboxClear?.addEventListener('click', () => { inbox = []; renderIO(); });
ui.btnSave?.addEventListener('click', () => {
    localStorage.setItem('lmc.program', ui.editor.value);
    ui.status.textContent = '已儲存到瀏覽器';
});
ui.btnLoadSaved?.addEventListener('click', () => {
    const val = localStorage.getItem('lmc.program');
    if (val != null) {
        ui.editor.value = val;
        ui.status.textContent = '已讀取儲存內容';
    } else {
        ui.status.textContent = '尚未有儲存內容';
    }
});
ui.btnExport?.addEventListener('click', () => {
    const blob = new Blob([ui.editor.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.lmc.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
ui.btnImport?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.lmc,.asm,text/plain';
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        file.text().then(text => { ui.editor.value = text; });
    });
    input.click();
});

ui.btnAssemble.addEventListener('click', () => {
	try {
		const res = assemble(ui.editor.value);
		assembled = res;
		buildListing(assembled);
		buildSymbols(ui.editor.value);
		ui.status.textContent = `彙編成功，共 ${assembled.length} 條`;
	} catch (e) {
		ui.status.textContent = `彙編錯誤：${e.message}`;
	}
});

ui.btnLoad.addEventListener('click', () => {
	if (assembled.length === 0) {
		try { assembled = assemble(ui.editor.value); buildListing(assembled); buildSymbols(ui.editor.value); } catch (e) { ui.status.textContent = `彙編錯誤：${e.message}`; return; }
	}
	cpu.load(assembled);
	lastState = cpu.getState();
	outbox = [];
	renderIO();
});

ui.btnStep.addEventListener('click', () => {
	const before = cpu.getState();
	const res = cpu.step(inbox);
	const after = cpu.getState();
	if (res.status === 'waiting' && before.waitingForInput === false && inbox.length > 0) {
		animateFlow(ui.inboxList, ui.acc, after.accumulator);
	}
	render(after);
	lastState = after;
});

ui.btnRun.addEventListener('click', () => {
	if (runTimer) { stopRun(); return; }
	startRun();
});

ui.btnReset.addEventListener('click', () => {
	cpu.reset();
	stopRun();
	outbox = [];
	renderIO();
	lastState = cpu.getState();
});

function startRun() {
	ui.btnRun.textContent = '暫停';
	runTimer = setInterval(() => {
		const pc = cpu.getState().programCounter;
		if (breakpoints.has(pc)) { stopRun(); return; }
		const before = cpu.getState();
		const res = cpu.step(inbox);
		const after = cpu.getState();
		if (breakpoints.has(after.programCounter)) { render(after); stopRun(); return; }
		if (res.status === 'waiting' && before.waitingForInput === false && inbox.length > 0) {
			animateFlow(ui.inboxList, ui.acc, after.accumulator);
		}
		render(after);
		lastState = after;
		if (res.status === 'halted') stopRun();
	}, Number(ui.speed.value));
}

function stopRun() {
	ui.btnRun.textContent = '執行';
	if (runTimer) clearInterval(runTimer);
	runTimer = null;
}

ui.speed.addEventListener('input', () => {
	if (runTimer) {
		clearInterval(runTimer);
		startRun();
	}
});

function buildListing(program) {
	listingLines = program.map((word, idx) => `${String(idx).padStart(2, '0')} ${format3(word)}`);
	ui.listing.innerHTML = '';
	listingLines.forEach((line, idx) => {
		const li = document.createElement('li');
		li.textContent = line;
		if (breakpoints.has(idx)) li.classList.add('breakpoint');
		li.addEventListener('click', () => toggleBreakpoint(idx, li));
		ui.listing.appendChild(li);
	});
}

function toggleBreakpoint(idx, li) {
	if (breakpoints.has(idx)) { breakpoints.delete(idx); li.classList.remove('breakpoint'); }
	else { breakpoints.add(idx); li.classList.add('breakpoint'); }
}

function buildSymbols(source) {
	// very simple: parse labels and resolved addresses similarly to assembler pass1
	const lines = source.split(/\r?\n/).map(l => l.replace(/;.*/, '')).filter(l => l.trim().length > 0);
	const sym = [];
	let loc = 0;
	for (const line of lines) {
		const parts = line.trim().split(/\s+/);
		let label = parts[0];
		const upper = (label || '').toUpperCase();
		const isMnemonic = ["ADD","SUB","STA","LDA","BRA","BRZ","BRP","IN","OUT","HLT","DAT"].includes(upper);
		if (!isMnemonic) {
			label = label.replace(/:$/, '');
			sym.push([label, loc]);
		}
		loc += 1;
	}
	symbolTable = sym;
	ui.symbolsTable.innerHTML = '<tr><th>標籤</th><th>位址</th></tr>' + sym.map(([k,v]) => `<tr><td>${k}</td><td>${String(v).padStart(2,'0')}</td></tr>`).join('');
}

function highlightListing(pc) {
	const children = ui.listing.children;
	for (let i = 0; i < children.length; i++) {
		children[i].classList.toggle('active', i === pc);
	}
}

function editMemoryCell(cell, addr) {
	const old = cell.textContent;
	const input = document.createElement('input');
	input.type = 'number';
	input.value = String(Number(old));
	input.style.width = '100%';
	cell.textContent = '';
	cell.appendChild(input);
	input.focus();
	const commit = () => {
		const val = Number(input.value);
		if (Number.isFinite(val)) {
			cpu.write(addr, val);
			cell.textContent = format3(cpu.read(addr));
		} else {
			cell.textContent = old;
		}
	};
	input.addEventListener('blur', commit);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } });
}

function animateStateChanges(prev, curr) {
	if (!prev) return;
	if (prev.programCounter !== curr.programCounter) flash(ui.pc);
	if (prev.instructionRegister !== curr.instructionRegister) flash(ui.ir);
	if (prev.accumulator !== curr.accumulator) flash(ui.acc);
	if ((prev.instructionRegister % 100) !== (curr.instructionRegister % 100)) flash(ui.adr);
}

function flash(el) {
	el.classList.remove('flash');
	void el.offsetWidth;
	el.classList.add('flash');
}

function animateFlow(fromEl, toEl, value) {
	if (!fromEl || !toEl) return;
	const fromRect = fromEl.getBoundingClientRect();
	const toRect = (toEl instanceof HTMLElement ? toEl : toEl.closest('div')).getBoundingClientRect();
	const token = document.createElement('div');
	token.className = 'flow-token';
	token.textContent = format3(value);
	document.body.appendChild(token);
	const startX = fromRect.left + fromRect.width * 0.5;
	const startY = fromRect.top + 10;
	const endX = toRect.left + toRect.width * 0.5;
	const endY = toRect.top + toRect.height * 0.5;
	token.style.transform = `translate(${startX}px, ${startY}px)`;
	token.style.opacity = '1';
	requestAnimationFrame(() => {
		token.style.transform = `translate(${endX}px, ${endY}px)`;
		token.style.opacity = '0';
		setTimeout(() => token.remove(), 350);
	});
}

// Help content
const HELP_HTML = `
<h3>指令速查表</h3>
<table>
	<tr><th>指令</th><th>作用</th><th>機器碼/格式</th><th>備註</th></tr>
	<tr><td>ADD addr</td><td>ACC += M[addr]</td><td>1xx</td><td>加法</td></tr>
	<tr><td>SUB addr</td><td>ACC -= M[addr]</td><td>2xx</td><td>減法</td></tr>
	<tr><td>STA addr</td><td>M[addr] = ACC</td><td>3xx</td><td>存入記憶體</td></tr>
	<tr><td>LDA addr</td><td>ACC = M[addr]</td><td>5xx</td><td>載入</td></tr>
	<tr><td>BRA addr</td><td>PC = addr</td><td>6xx</td><td>跳躍</td></tr>
	<tr><td>BRZ addr</td><td>若 ACC == 0 跳</td><td>7xx</td><td>等於 0</td></tr>
	<tr><td>BRP addr</td><td>若 ACC ≥ 0 跳</td><td>8xx</td><td>非負</td></tr>
	<tr><td>IN</td><td>ACC = 輸入</td><td>901</td><td>從 INPUT 讀</td></tr>
	<tr><td>OUT</td><td>輸出 ACC</td><td>902</td><td>到 OUTPUT</td></tr>
	<tr><td>HLT</td><td>停止</td><td>000</td><td>程式結束</td></tr>
	<tr><td>DAT n</td><td>定義常數</td><td>—</td><td>資料儲存</td></tr>
</table>

<h3>如何使用</h3>
<ol>
	<li>在左側輸入程式。格式：<code>[標籤] 指令 [運算元] ; 註解</code></li>
	<li>點「彙編」→「載入」。</li>
	<li>若程式有 IN，先在 INPUT 輸入框輸入數字按「加入」。</li>
	<li>用「單步」觀察或按「執行」，速度可用滑桿調整。</li>
</ol>

<h3>範例：兩數相加</h3>
<pre><code>IN
STA A
IN
ADD A
OUT
HLT
A   DAT 0</code></pre>
`;

ui.btnHelp.addEventListener('click', () => {
	ui.helpBody.innerHTML = HELP_HTML;
	ui.helpModal.setAttribute('aria-hidden', 'false');
});

ui.helpClose.addEventListener('click', () => {
	ui.helpModal.setAttribute('aria-hidden', 'true');
});

ui.helpModal.addEventListener('click', (e) => {
	if (e.target === ui.helpModal) ui.helpModal.setAttribute('aria-hidden', 'true');
});

// 範例程式
const EXAMPLES = [
	{
		name: '輸出常數 3 次',
		source: `
; 輸出 42 三次，然後停止
				LDA NUM
				OUT
				OUT
				OUT
				HLT
NUM			DAT 42
`
	},
	{
		name: '回聲輸入 (讀一個數並輸出)',
		source: `
				IN
				OUT
				HLT
`
	},
	{
		name: '累加直到負數 (輸出總和)',
		source: `
; 持續讀取正數，遇到負數結束並輸出總和
START		IN
				BRP POS
				LDA SUM
				OUT
				HLT
POS			ADD SUM
				STA SUM
				BRA START
SUM			DAT 0
`
	},
];

function loadExamples() {
	ui.examples.innerHTML = '';
	EXAMPLES.forEach((ex, idx) => {
		const opt = document.createElement('option');
		opt.value = String(idx);
		opt.textContent = ex.name;
		ui.examples.appendChild(opt);
	});
}

ui.btnLoadExample.addEventListener('click', () => {
	const idx = Number(ui.examples.value) | 0;
	ui.editor.value = EXAMPLES[idx].source.trim().replace(/^\n+|\n+$/g, '');
});

// 初始化
loadExamples();
ui.examples.value = '0';
ui.btnLoadExample.click();
render(cpu.getState());
renderIO();
lastState = cpu.getState();
