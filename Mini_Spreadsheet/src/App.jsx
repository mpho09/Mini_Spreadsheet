import { useState } from 'react'

// CONFIG object: keeps all settings in one place
const CONFIG = {
  COLUMNS: 10, // number of columns (A-J)
  ROWS: 20,    // number of rows (1-20)
  ERRORS: {
    CIRCULAR: "#CIRCULAR!", // circular reference error
    DIV_ZERO: "#DIV/0!",    // division by zero error
    VALUE: "#VALUE!",       // invalid arithmetic on text
    SYNTAX: "#ERROR!"       // invalid formula syntax
  }
};

function App() {
  // State: each cell stores raw input and computed value
  const [cells, setCells] = useState(() => {
    const initial = {};
    for (let r = 1; r <= CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLUMNS; c++) {
        const id = `${String.fromCharCode(65 + c)}${r}`;
        initial[id] = { raw: "", value: "" };
      }
    }
    return initial;
  });

  const [selectedCell, setSelectedCell] = useState(null);
  const [formulaInput, setFormulaInput] = useState("");

  // Tokenize formula string into parts (numbers, refs, operators)
  function tokenize(expr) {
    return expr.match(/[A-J][1-9][0-9]?|\d+(\.\d+)?|[+\-*/()]/g);
  }

  // Evaluate a cell's value
  function evaluate(cellId, visited = new Set()) {
    const raw = cells[cellId].raw;
    if (!raw) return "";

    // Detect circular references
    if (visited.has(cellId)) return CONFIG.ERRORS.CIRCULAR;
    visited.add(cellId);

    // If not a formula, return number or text
    if (!raw.startsWith("=")) {
      return isNaN(raw) ? raw : Number(raw);
    }

    try {
      // Tokenize formula (remove '=' first)
      const tokens = tokenize(raw.slice(1));
      if (!tokens) return CONFIG.ERRORS.SYNTAX;

      // Replace cell references with their values
      const replaced = tokens
        .map(tok => {
          if (/^[A-J][1-9][0-9]?$/.test(tok)) {
            const val = evaluate(tok, new Set(visited));
            if (typeof val === "string" && val.startsWith("#")) return "NaN";
            return val || 0; // treat empty as 0
          }
          return tok;
        })
        .join(" ");

      // Safely compute result
      const result = Function(`"use strict"; return (${replaced})`)();
      if (result === Infinity || result === -Infinity) return CONFIG.ERRORS.DIV_ZERO;
      if (isNaN(result)) return CONFIG.ERRORS.VALUE;
      return result;
    } catch {
      return CONFIG.ERRORS.SYNTAX;
    }
  }

  // Recalculate all cells
  function recalcAll(updatedCells) {
    const newCells = { ...updatedCells };
    for (const id in newCells) {
      newCells[id].value = evaluate(id);
    }
    return newCells;
  }

  // Handle selecting a cell
  function handleSelect(cellId) {
    setSelectedCell(cellId);
    setFormulaInput(cells[cellId].raw);
  }

  // Handle pressing Enter in formula bar
  function handleKeyDown(e) {
    if (e.key === "Enter" && selectedCell) {
      const updatedCells = { ...cells };
      updatedCells[selectedCell].raw = formulaInput.trim();
      const recalculated = recalcAll(updatedCells);
      setCells(recalculated);
    }
  }

  // Render grid headers and cells
  const headers = [];
  for (let c = 0; c < CONFIG.COLUMNS; c++) {
    headers.push(String.fromCharCode(65 + c));
  }

  return (
    <div className="p-4">
      {/* Formula bar */}
      <input
        type="text"
        value={formulaInput}
        onChange={e => setFormulaInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full border border-gray-400 rounded p-2 mb-4"
        placeholder="Enter formula or value"
      />

      {/* Spreadsheet grid */}
      <table className="border-collapse border border-gray-400">
        <thead>
          <tr>
            <th className="border border-gray-400 px-2 py-1 bg-gray-200"></th>
            {headers.map(h => (
              <th
                key={h}
                className="border border-gray-400 px-2 py-1 bg-gray-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: CONFIG.ROWS }, (_, r) => (
            <tr key={r + 1}>
              <th className="border border-gray-400 px-2 py-1 bg-gray-200">
                {r + 1}
              </th>
              {headers.map(h => {
                const id = `${h}${r + 1}`;
                return (
                  <td
                    key={id}
                    onClick={() => handleSelect(id)}
                    className="border border-gray-400 px-4 py-2 cursor-pointer"
                  >
                    {cells[id].value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
