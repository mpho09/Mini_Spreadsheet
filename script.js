

const COLS = 10;   // A–J
const ROWS = 20;   // 1–20



class Engine {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;


        this.raw = {};


        this.computed = {};


        this.dependsOn = {};
        this.dependents = {};
    }



    _key(col, row) { return `${col}${row}`; }

    _colLetter(index) { return String.fromCharCode(65 + index); }

    // Parse "A1" → { col: 'A', row: 1 }  or null
    _parseRef(ref) {
        const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
        if (!m) return null;
        return { col: m[1], row: parseInt(m[2], 10) };
    }


    _expandRange(start, end) {
        const s = this._parseRef(start);
        const e = this._parseRef(end);
        if (!s || !e) return [];

        const colStart = s.col.charCodeAt(0);
        const colEnd = e.col.charCodeAt(0);
        const rowStart = Math.min(s.row, e.row);
        const rowEnd = Math.max(s.row, e.row);

        const keys = [];
        for (let c = Math.min(colStart, colEnd); c <= Math.max(colStart, colEnd); c++) {
            for (let r = rowStart; r <= rowEnd; r++) {
                keys.push(`${String.fromCharCode(c)}${r}`);
            }
        }
        return keys;
    }


    _numValue(key) {
        const v = this.computed[key];
        if (v === undefined || v === null || v === '') return 0;
        if (v instanceof Error) return 0;
        const n = Number(v);
        return isNaN(n) ? 0 : n;
    }


    _evalFormula(formula, visitingSet) {
        // Strip leading "="
        let expr = formula.slice(1).trim().toUpperCase();

        const deps = new Set();


        expr = expr.replace(
            /\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\s*\(\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*\)/g,
            (_, fn, start, end) => {
                const keys = this._expandRange(start, end);
                keys.forEach(k => deps.add(k));
                const nums = keys.map(k => this._numValue(k));
                switch (fn) {
                    case 'SUM': return nums.reduce((a, b) => a + b, 0);
                    case 'AVERAGE':
                    case 'AVG': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                    case 'MIN': return nums.length ? Math.min(...nums) : 0;
                    case 'MAX': return nums.length ? Math.max(...nums) : 0;
                    case 'COUNT': return nums.length;
                    default: return 0;
                }
            }
        );


        expr = expr.replace(/\b([A-Z]+)(\d+)\b/g, (_, col, row) => {
            const key = `${col}${row}`;


            if (visitingSet.has(key)) {
                throw new Error('#CIRC!');
            }

            deps.add(key);
            return this._numValue(key);
        });


        if (!/^[\d\s+\-*/().eE]+$/.test(expr)) {
            throw new Error('#EXPR!');
        }


        const result = Function(`"use strict"; return (${expr})`)();

        if (!isFinite(result)) throw new Error('#DIV/0!');

        return { value: result, deps };
    }



    _removeDeps(key) {
        const old = this.dependsOn[key];
        if (!old) return;
        old.forEach(dep => {
            if (this.dependents[dep]) this.dependents[dep].delete(key);
        });
        delete this.dependsOn[key];
    }

    _addDeps(key, deps) {
        this.dependsOn[key] = deps;
        deps.forEach(dep => {
            if (!this.dependents[dep]) this.dependents[dep] = new Set();
            this.dependents[dep].add(key);
        });
    }


    _getDependentOrder(key) {
        const visited = new Set();
        const order = [];

        const visit = (k) => {
            if (visited.has(k)) return;
            visited.add(k);
            (this.dependents[k] || new Set()).forEach(visit);
            order.push(k);
        };

        (this.dependents[key] || new Set()).forEach(visit);
        return order;
    }


    _recompute(key, visitingSet) {
        const raw = this.raw[key];

        if (!raw || raw.trim() === '') {
            return '';
        }

        if (raw.startsWith('=')) {
            try {
                visitingSet.add(key);
                const { value, deps } = this._evalFormula(raw, visitingSet);
                visitingSet.delete(key);
                this._removeDeps(key);
                this._addDeps(key, deps);
                return value;
            } catch (e) {
                visitingSet.delete(key);
                return e;
            }
        }

        // Plain number or text
        const n = Number(raw);
        return isNaN(n) ? raw : n;
    }


    set(key, value) {
        this.raw[key] = value;


        this._removeDeps(key);


        const toUpdate = [key, ...this._getDependentOrder(key)];

        const changed = [];
        toUpdate.forEach(k => {
            const prev = this.computed[k];
            const next = this._recompute(k, new Set());
            this.computed[k] = next;
            if (prev !== next) changed.push(k);
        });

        return changed;
    }

    getRaw(key) { return this.raw[key] ?? ''; }
    getComputed(key) { return this.computed[key] ?? ''; }
}



class SpreadsheetUI {
    constructor(engine) {
        this.engine = engine;
        this.selected = null;
        this.editing = false;

        // DOM refs
        this.$grid = document.getElementById('grid');
        this.$cellAddress = document.getElementById('cell-address');
        this.$formulaInput = document.getElementById('formula-input');
        this.$cellEditor = document.getElementById('cell-editor');
        this.$statusCell = document.getElementById('status-cell');
        this.$statusValue = document.getElementById('status-value');

        this._buildGrid();
        this._bindFormulaBar();
        this._bindCellEditor();
        this._bindKeyboard();


        this._selectCell('A1');
    }



    _colLetter(i) { return String.fromCharCode(65 + i); }

    _buildGrid() {
        const frag = document.createDocumentFragment();


        const headerRow = document.createElement('tr');
        const corner = document.createElement('th');
        corner.className = 'corner';
        headerRow.appendChild(corner);

        for (let c = 0; c < this.engine.cols; c++) {
            const th = document.createElement('th');
            th.className = 'col-header';
            th.textContent = this._colLetter(c);
            th.dataset.col = this._colLetter(c);
            headerRow.appendChild(th);
        }
        frag.appendChild(headerRow);


        for (let r = 1; r <= this.engine.rows; r++) {
            const tr = document.createElement('tr');


            const rh = document.createElement('td');
            rh.className = 'row-header';
            rh.textContent = r;
            rh.dataset.row = r;
            tr.appendChild(rh);

            for (let c = 0; c < this.engine.cols; c++) {
                const key = `${this._colLetter(c)}${r}`;
                const td = document.createElement('td');
                td.className = 'cell';
                td.dataset.cell = key;
                td.tabIndex = 0;

                const span = document.createElement('span');
                span.className = 'cell-display';
                span.dataset.cellSpan = key;
                td.appendChild(span);

                td.addEventListener('click', () => this._selectCell(key));
                td.addEventListener('dblclick', () => this._startEdit(key));

                tr.appendChild(td);
            }

            frag.appendChild(tr);
        }

        this.$grid.appendChild(frag);
    }

    

    _selectCell(key) {
        if (this.editing) this._commitEdit();

        
        if (this.selected) {
            const prev = this.$grid.querySelector(`[data-cell="${this.selected}"]`);
            if (prev) prev.classList.remove('selected');

            
            this._highlightHeaders(this.selected, false);
        }

        this.selected = key;
        const parsed = this.engine._parseRef(key);

       
        const td = this.$grid.querySelector(`[data-cell="${key}"]`);
        if (td) td.classList.add('selected');
        this._highlightHeaders(key, true);

        
        this.$cellAddress.value = key;
        this.$formulaInput.value = this.engine.getRaw(key);

        
        this.$statusCell.textContent = key;
        const cv = this.engine.getComputed(key);
        this.$statusValue.textContent = cv instanceof Error ? cv.message : cv;
    }

    _highlightHeaders(key, on) {
        const p = this.engine._parseRef(key);
        if (!p) return;

        const colTh = this.$grid.querySelector(`th[data-col="${p.col}"]`);
        const rowTd = this.$grid.querySelector(`td[data-row="${p.row}"]`);
        if (colTh) colTh.classList.toggle('active', on);
        if (rowTd) rowTd.classList.toggle('active', on);
    }

    

    _updateCellDisplay(key) {
        const span = this.$grid.querySelector(`[data-cell-span="${key}"]`);
        if (!span) return;

        const val = this.engine.getComputed(key);

        span.className = 'cell-display'; 

        if (val instanceof Error) {
            span.textContent = val.message;
            span.classList.add('is-error');
        } else if (typeof val === 'number') {
            
            span.textContent = parseFloat(val.toFixed(10)).toString();
            span.classList.add('is-number');
        } else {
            span.textContent = val;
            span.classList.add('is-text');
        }
    }

    

    _commitValue(key, raw) {
        const changed = this.engine.set(key, raw);
        changed.forEach(k => {
            this._updateCellDisplay(k);
            
            if (k === this.selected) {
                const cv = this.engine.getComputed(k);
                this.$statusValue.textContent = cv instanceof Error ? cv.message : cv;
            }
        });
    }

   

    _startEdit(key) {
        this.editing = true;
        const td = this.$grid.querySelector(`[data-cell="${key}"]`);
        if (!td) return;

        const rect = td.getBoundingClientRect();
        const editor = this.$cellEditor;

        editor.style.display = 'block';
        editor.style.left = `${rect.left + window.scrollX}px`;
        editor.style.top = `${rect.top + window.scrollY}px`;
        editor.style.width = `${rect.width}px`;
        editor.style.height = `${rect.height}px`;
        editor.value = this.engine.getRaw(key);
        editor.focus();
        editor.select();
    }

    _commitEdit() {
        if (!this.editing) return;
        this.editing = false;

        const raw = this.$cellEditor.value;
        this.$cellEditor.style.display = 'none';

        this._commitValue(this.selected, raw);
        this.$formulaInput.value = this.engine.getRaw(this.selected);
    }

    _cancelEdit() {
        this.editing = false;
        this.$cellEditor.style.display = 'none';
    }

    _bindCellEditor() {
        this.$cellEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._commitEdit();
                this._moveSelection(1, 0);
            } else if (e.key === 'Escape') {
                this._cancelEdit();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this._commitEdit();
                this._moveSelection(0, 1);
            }
        });

        this.$cellEditor.addEventListener('blur', () => {
            
            setTimeout(() => { if (this.editing) this._commitEdit(); }, 80);
        });
    }

    

    _bindFormulaBar() {
        // Pressing Enter in the formula bar commits the value
        this.$formulaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const raw = this.$formulaInput.value;
                this._commitValue(this.selected, raw);
                // Return focus to the grid
                const td = this.$grid.querySelector(`[data-cell="${this.selected}"]`);
                if (td) td.focus();
            } else if (e.key === 'Escape') {
                this.$formulaInput.value = this.engine.getRaw(this.selected);
            }
        });
    }

    

    _parseRef(key) { return this.engine._parseRef(key); }

    _moveSelection(rowDelta, colDelta) {
        const p = this._parseRef(this.selected);
        if (!p) return;

        const newColCode = p.col.charCodeAt(0) + colDelta;
        const newRow = p.row + rowDelta;

        const colLetter = String.fromCharCode(newColCode);
        const colIndex = newColCode - 65;

        if (colIndex < 0 || colIndex >= this.engine.cols) return;
        if (newRow < 1 || newRow > this.engine.rows) return;

        this._selectCell(`${colLetter}${newRow}`);
    }

    _bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (this.editing) return;  

            
            if (document.activeElement === this.$formulaInput) return;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this._moveSelection(-1, 0);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this._moveSelection(1, 0);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this._moveSelection(0, -1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this._moveSelection(0, 1);
                    break;
                case 'Tab':
                    e.preventDefault();
                    this._moveSelection(0, e.shiftKey ? -1 : 1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.selected) this._startEdit(this.selected);
                    break;
                case 'Escape':
                    this._cancelEdit();
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.selected) {
                        this._commitValue(this.selected, '');
                        this.$formulaInput.value = '';
                    }
                    break;
                default:
                    
                    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && this.selected) {
                        this._startEdit(this.selected);
                        
                        this.$cellEditor.value = e.key;
                       
                        setTimeout(() => {
                            this.$cellEditor.selectionStart =
                                this.$cellEditor.selectionEnd = this.$cellEditor.value.length;
                        }, 0);
                    }
            }
        });
    }
}

const engine = new Engine(COLS, ROWS);
const ui = new SpreadsheetUI(engine);