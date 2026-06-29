# Mini Spreadsheet

A simple spreadsheet that runs in your web browser. It is built with plain HTML, CSS, and JavaScript. There are no frameworks, no libraries, and nothing to install. You just open it and use it.

It gives you a grid of cells you can click and type into, a formula bar, and live formulas like `=A1+B2`. It also has a few built-in functions (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`) and it updates automatically when you change a number.

## What it can do

- A grid of cells, 10 columns (A to J) and 20 rows.
- Formulas that start with `=`, like `=A1+B2` or `=(A1+A2)*3`.
- Built-in functions over a range of cells, like `=SUM(A1:A5)`.
- Correct math order: it does multiply and divide before add and subtract, and it handles brackets.
- Automatic updates: change one cell and any cell that uses it updates right away.
- Loop protection: if a formula points back to itself it shows `#CIRCULAR!` instead of freezing.
- Clear error messages: `#DIV/0!`, `#VALUE!`, `#REF!`, `#ERROR!`, `#CIRCULAR!`.
- Keyboard controls: arrow keys to move, Enter or F2 to edit, Esc to cancel, Delete to clear.

## What is in the project

```
Mini_Spreadsheet/
├── index.html    The page layout (the grid, formula bar, editor, footer)
├── styles.css    The styling (colours, borders, the look of the grid)
└── script.js     All the logic (how formulas work and how the grid behaves)
```

## How to run it

1. Download or clone the project.
2. Make sure `index.html`, `styles.css`, and `script.js` are all in the same folder.
3. Double-click `index.html` to open it in your browser.

That is all. Nothing to install.

## How to use it

| What you want to do | How to do it |
| --- | --- |
| Select a cell | Click it, or use the arrow keys |
| Edit a cell | Double-click it, press Enter or F2, or just start typing |
| Add a value | Type a number or text, then press Enter |
| Add a formula | Start with `=`, like `=A1+A2`, then press Enter |
| Cancel an edit | Press Esc |
| Clear a cell | Select it and press Delete or Backspace |
| Move while editing | Press Tab (right) or Shift+Tab (left) |

### Some formula examples

| Formula | What it does |
| --- | --- |
| `=A1+B1` | Adds two cells |
| `=(A1+A2)*2` | Brackets and multiply |
| `=SUM(A1:A10)` | Adds up a range |
| `=AVG(B1:B5)` | Average of a range |
| `=MAX(C1:C20)` | The biggest value in a range |
| `=10/A1` | Divides (shows `#DIV/0!` if A1 is 0) |

## How the code works

All the logic lives in `script.js`. The basic idea is: save what the user typed, break formulas into small pieces, work out the answer, remember which cells depend on which, and then update the screen. Here is each part in simple terms.

### 1. Where the data is kept

The code uses four lists to keep track of everything:

- `cells` holds what the user actually typed in each cell, like `"=A1+5"` or `"42"`.
- `values` holds the answer for each cell (the number or error you see).
- `dependencies` remembers, for each cell, which other cells it reads from.
- `reverseDependencies` remembers the opposite: which cells read from this one. This is what makes updates fast.

### 2. Working out the answer

The `runFormula` function is the calculator. It is split into three helpers that call each other, and this is what makes the math come out in the right order:

- `calculateExpression` handles `+` and `-`, which happen last.
- `calculateTerm` handles `*` and `/`, which happen first.
- `calculatePrimary` handles the simple building blocks: a single number, a cell name, a function like `SUM(A1:A5)`, or something inside brackets.

Because `calculateTerm` runs inside `calculateExpression`, multiply and divide naturally happen before add and subtract, just like in normal maths. Anything inside brackets gets solved first.

When the calculator meets a cell name, it asks for that cell's value. If that cell also has a formula, the same process runs again for it.

### 3. Finding one cell's value

The `calculateCell` function decides what a single cell is worth:

- If it is empty, the answer is `0`.
- If it is a plain number, that is the answer.
- If it is plain text, the text is the answer.
- If it starts with `=`, it gets broken into pieces and calculated.

While it works, it keeps a list of the cells it is currently busy with. If it ever runs into a cell that is already on that list, it knows the formula is pointing back to itself in a loop, so it returns `#CIRCULAR!` instead of running forever.

### 4. The screen and the buttons

All the visual parts are grouped together in one object called `UI`:

- `createGrid` builds the table: the row of column letters at the top and all the cells, each one given a name like `A1` and the ability to respond to clicks.
- `selectCell` highlights the cell you are on and keeps the formula bar in sync.
- `startEdit`, `saveEdit`, and `cancelEdit` handle the little edit box that appears when you type in a cell.
- `refreshCell` reads a cell's answer and shows it on screen, styled as a number, text, or an error.
- `handleKeyboard` makes the arrow keys and shortcuts work.
- `moveCell` works out which cell to jump to when you press an arrow, and stops you from going off the edge.

When the page loads, `UI.start()` builds the grid, switches on all the controls, and selects cell A1.

Created by Team Copilot:Mpho Mangena, Kabelo Mathapo, Refilwe Segoe, Elias Mtisie, Joy Molomo.
