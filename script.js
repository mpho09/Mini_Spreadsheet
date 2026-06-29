'use strict';


const CONFIG = {
    columns: 10,
    rows: 20,

    errors: {
        circular: "#CIRCULAR!",
        divZero: "#DIV/0!",
        value: "#VALUE!",
        syntax: "#ERROR!",
        ref: "#REF!"
    }
};

const cells = {};
const values = {};
const dependencies = {};
const reverseDependencies = {};

function getColumnLetter(number) {
    return String.fromCharCode(65 + number);
}


function getCellName(column, row) {
    return getColumnLetter(column) + (row + 1);
}


function getCellPosition(reference) {

    let result = reference.match(/^([A-Z]+)(\d+)$/i);

    if (!result) {
        return null;
    }

    let column = result[1].toUpperCase().charCodeAt(0) - 65;
    let row = parseInt(result[2]) - 1;


    if (column < 0 || column >= CONFIG.columns) {
        return null;
    }

    if (row < 0 || row >= CONFIG.rows) {
        return null;
    }


    return {
        column: column,
        row: row
    };
}



function isError(value) {

    return (
        value === CONFIG.errors.circular ||
        value === CONFIG.errors.divZero ||
        value === CONFIG.errors.value ||
        value === CONFIG.errors.syntax ||
        value === CONFIG.errors.ref
    );
}

function splitFormula(formula) {

    let parts = [];
    let index = 0;


    while (index < formula.length) {

        let character = formula[index];



        if (/\s/.test(character)) {
            index++;
            continue;
        }

        if (
            /\d/.test(character) ||
            (character === "." && /\d/.test(formula[index + 1] || ""))
        ) {

            let number = "";

            while (
                index < formula.length &&
                /[\d.]/.test(formula[index])
            ) {

                number += formula[index];
                index++;
            }


            parts.push({
                type: "number",
                value: parseFloat(number)
            });

            continue;
        }

        if (/[a-zA-Z]/.test(character)) {

            let word = "";

            while (
                index < formula.length &&
                /[a-zA-Z0-9]/.test(formula[index])
            ) {

                word += formula[index];
                index++;
            }


            word = word.toUpperCase();


            if (
                word === "SUM" ||
                word === "AVG" ||
                word === "MIN" ||
                word === "MAX" ||
                word === "COUNT"
            ) {

                parts.push({
                    type: "function",
                    value: word
                });

            } else {

                parts.push({
                    type: "cell",
                    value: word
                });
            }


            continue;
        }




        // math symbols
        if (
            character === "+" ||
            character === "-" ||
            character === "*" ||
            character === "/"
        ) {

            parts.push({
                type: "operator",
                value: character
            });

            index++;
            continue;
        }



        if (character === "(") {

            parts.push({
                type: "open"
            });

            index++;
            continue;
        }



        if (character === ")") {

            parts.push({
                type: "close"
            });

            index++;
            continue;
        }



        if (character === ":") {

            parts.push({
                type: "colon"
            });

            index++;
            continue;
        }



        if (character === ",") {

            parts.push({
                type: "comma"
            });

            index++;
            continue;
        }

        return null;
    }


    return parts;
}



// get the value of a cell
function calculateCell(cellName, checkedCells) {


    // prevents endless loops
    if (checkedCells.has(cellName)) {
        return CONFIG.errors.circular;
    }



    let currentCell = cells[cellName];

    let text = "";

    if (currentCell) {
        text = currentCell;
    }



    // empty cells are zero
    if (text === "") {
        return 0;
    }



    // normal number
    if (!text.startsWith("=")) {

        let number = Number(text);

        if (!isNaN(number)) {
            return number;
        }

        return text;
    }



    checkedCells.add(cellName);


    let formula = text.substring(1);

    let tokens = splitFormula(formula);


    if (!tokens || tokens.length === 0) {

        checkedCells.delete(cellName);
        return CONFIG.errors.syntax;
    }



    let answer = runFormula(tokens, checkedCells);


    checkedCells.delete(cellName);


    return answer;
}

// handles the formula calculations
function runFormula(tokens, checkedCells) {

    let position = 0;


    function currentToken() {
        return tokens[position];
    }


    function nextToken() {
        let token = tokens[position];
        position++;
        return token;
    }



    // addition and subtraction
    function calculateExpression() {

        let result = calculateTerm();


        while (
            currentToken() &&
            currentToken().type === "operator" &&
            (
                currentToken().value === "+" ||
                currentToken().value === "-"
            )
        ) {


            let operator = nextToken().value;

            let secondValue = calculateTerm();


            if (isError(result)) {
                return result;
            }


            if (isError(secondValue)) {
                return secondValue;
            }



            if (
                typeof result !== "number" ||
                typeof secondValue !== "number"
            ) {
                return CONFIG.errors.value;
            }



            if (operator === "+") {
                result = result + secondValue;
            } else {
                result = result - secondValue;
            }
        }


        return result;
    }





    // multiplication and division
    function calculateTerm() {

        let result = calculatePrimary();


        while (
            currentToken() &&
            currentToken().type === "operator" &&
            (
                currentToken().value === "*" ||
                currentToken().value === "/"
            )
        ) {


            let operator = nextToken().value;

            let secondValue = calculatePrimary();



            if (isError(result)) {
                return result;
            }


            if (isError(secondValue)) {
                return secondValue;
            }



            if (
                typeof result !== "number" ||
                typeof secondValue !== "number"
            ) {
                return CONFIG.errors.value;
            }



            if (
                operator === "/" &&
                secondValue === 0
            ) {
                return CONFIG.errors.divZero;
            }



            if (operator === "*") {

                result = result * secondValue;

            } else {

                result = result / secondValue;

            }

        }


        return result;
    }






    // numbers, cells, functions, brackets
    function calculatePrimary() {


        let token = currentToken();


        if (!token) {
            return CONFIG.errors.syntax;
        }




        // number
        if (token.type === "number") {

            nextToken();

            return token.value;
        }





        // cell reference
        if (token.type === "cell") {

            nextToken();


            let location = getCellPosition(token.value);


            if (!location) {
                return CONFIG.errors.ref;
            }


            let name = getCellName(
                location.column,
                location.row
            );


            return calculateCell(
                name,
                checkedCells
            );
        }





        // functions like SUM(A1:A5)
        if (token.type === "function") {


            let functionName = nextToken().value;



            if (
                !currentToken() ||
                currentToken().type !== "open"
            ) {

                return CONFIG.errors.syntax;
            }


            nextToken();



            let firstCell = currentToken();


            if (
                !firstCell ||
                firstCell.type !== "cell"
            ) {

                return CONFIG.errors.syntax;
            }


            nextToken();



            if (
                !currentToken() ||
                currentToken().type !== "colon"
            ) {

                return CONFIG.errors.syntax;
            }


            nextToken();



            let lastCell = currentToken();


            if (
                !lastCell ||
                lastCell.type !== "cell"
            ) {

                return CONFIG.errors.syntax;
            }


            nextToken();



            if (
                !currentToken() ||
                currentToken().type !== "close"
            ) {

                return CONFIG.errors.syntax;
            }


            nextToken();




            let start = getCellPosition(firstCell.value);
            let end = getCellPosition(lastCell.value);



            if (!start || !end) {
                return CONFIG.errors.ref;
            }




            let numbers = [];



            let startColumn = Math.min(
                start.column,
                end.column
            );

            let endColumn = Math.max(
                start.column,
                end.column
            );


            let startRow = Math.min(
                start.row,
                end.row
            );

            let endRow = Math.max(
                start.row,
                end.row
            );




            for (
                let row = startRow;
                row <= endRow;
                row++
            ) {


                for (
                    let column = startColumn;
                    column <= endColumn;
                    column++
                ) {


                    let name = getCellName(
                        column,
                        row
                    );


                    let value = calculateCell(
                        name,
                        checkedCells
                    );



                    if (isError(value)) {
                        return value;
                    }



                    if (typeof value === "number") {
                        numbers.push(value);
                    }

                }

            }





            if (functionName === "SUM") {

                let total = 0;

                numbers.forEach(function (number) {
                    total += number;
                });

                return total;
            }



            if (functionName === "AVG") {


                if (numbers.length === 0) {
                    return 0;
                }


                let total = 0;


                numbers.forEach(function (number) {
                    total += number;
                });


                return total / numbers.length;
            }




            if (functionName === "MIN") {

                if (numbers.length === 0) {
                    return 0;
                }


                return Math.min(...numbers);
            }




            if (functionName === "MAX") {

                if (numbers.length === 0) {
                    return 0;
                }


                return Math.max(...numbers);
            }





            if (functionName === "COUNT") {

                return numbers.length;
            }


            return CONFIG.errors.syntax;
        }






        // brackets
        if (token.type === "open") {


            nextToken();


            let result = calculateExpression();



            if (
                !currentToken() ||
                currentToken().type !== "close"
            ) {

                return CONFIG.errors.syntax;
            }



            nextToken();


            return result;
        }




        return CONFIG.errors.syntax;
    }





    let finalValue = calculateExpression();



    // extra tokens means formula is wrong
    if (position < tokens.length) {
        return CONFIG.errors.syntax;
    }


    return finalValue;
}






// find cells used inside formulas
function findDependencies(text) {


    let found = new Set();


    if (!text.startsWith("=")) {
        return found;
    }



    let tokens = splitFormula(
        text.substring(1)
    );


    if (!tokens) {
        return found;
    }




    tokens.forEach(function (token) {


        if (token.type === "cell") {


            let location = getCellPosition(
                token.value
            );


            if (location) {

                found.add(
                    getCellName(
                        location.column,
                        location.row
                    )
                );

            }
        }

    });



    return found;
}






// remove old connections
function removeDependencies(cellName) {


    let old = dependencies[cellName];


    if (!old) {
        return;
    }



    old.forEach(function (otherCell) {


        if (reverseDependencies[otherCell]) {

            reverseDependencies[otherCell].delete(
                cellName
            );

        }

    });



    dependencies[cellName] = new Set();
}







// create new dependency connections
function updateDependencies(cellName, text) {


    removeDependencies(cellName);


    let list = findDependencies(text);


    dependencies[cellName] = list;



    list.forEach(function (otherCell) {


        if (!reverseDependencies[otherCell]) {

            reverseDependencies[otherCell] = new Set();

        }


        reverseDependencies[otherCell].add(
            cellName
        );

    });

}

// find all cells that need updating
function getCellsToUpdate(startCell) {

    let result = [];
    let checked = new Set();

    let queue = [startCell];


    while (queue.length > 0) {

        let current = queue.shift();


        if (checked.has(current)) {
            continue;
        }


        checked.add(current);

        result.push(current);



        if (reverseDependencies[current]) {

            reverseDependencies[current].forEach(function (cell) {

                queue.push(cell);

            });

        }

    }


    return result;
}





// save cell data and recalculate
function updateCell(cellName, text) {


    cells[cellName] = text;


    updateDependencies(
        cellName,
        text
    );



    let affectedCells = getCellsToUpdate(
        cellName
    );



    affectedCells.forEach(function (cell) {


        values[cell] = calculateCell(
            cell,
            new Set()
        );


    });



    return affectedCells;
}






// get displayed value
function getCellValue(cellName) {


    if (values[cellName] === undefined) {


        values[cellName] = calculateCell(
            cellName,
            new Set()
        );

    }


    return values[cellName];
}






// get what user typed
function getCellText(cellName) {


    if (cells[cellName]) {

        return cells[cellName];

    }


    return "";
}






/* =========================
        USER INTERFACE
========================= */


const UI = {

    grid: document.getElementById("grid"),
    address: document.getElementById("cell-address"),
    formulaInput: document.getElementById("formula-input"),
    editor: document.getElementById("cell-editor"),
    statusCell: document.getElementById("status-cell"),
    statusValue: document.getElementById("status-value"),


    selectedCell: null,
    selectedElement: null,
    editing: false,






    createGrid: function () {


        let tableHead = document.createElement("thead");

        let headerRow = document.createElement("tr");



        let emptyCorner = document.createElement("th");

        headerRow.appendChild(emptyCorner);




        for (
            let column = 0;
            column < CONFIG.columns;
            column++
        ) {


            let header = document.createElement("th");


            header.innerText = getColumnLetter(
                column
            );


            header.className = "col-header";

            header.dataset.column = column;


            headerRow.appendChild(header);

        }




        tableHead.appendChild(headerRow);

        this.grid.appendChild(tableHead);






        let body = document.createElement("tbody");



        for (
            let row = 0;
            row < CONFIG.rows;
            row++
        ) {



            let rowElement = document.createElement("tr");



            let rowNumber = document.createElement("td");

            rowNumber.innerText = row + 1;

            rowNumber.className = "row-header";

            rowNumber.dataset.row = row;



            rowElement.appendChild(rowNumber);






            for (
                let column = 0;
                column < CONFIG.columns;
                column++
            ) {


                let cell = document.createElement("td");



                let name = getCellName(
                    column,
                    row
                );



                cell.className = "cell";

                cell.dataset.key = name;

                cell.dataset.column = column;

                cell.dataset.row = row;




                let display = document.createElement("span");

                display.className = "cell-display";

                cell.appendChild(display);




                cell.addEventListener(
                    "mousedown",
                    function (event) {

                        if (UI.editing) {

                            UI.saveEdit();

                        }


                        UI.selectCell(
                            event.currentTarget
                        );

                    }
                );




                cell.addEventListener(
                    "dblclick",
                    function (event) {


                        UI.selectCell(
                            event.currentTarget
                        );


                        UI.startEdit();

                    }
                );



                rowElement.appendChild(cell);

            }




            body.appendChild(rowElement);

        }




        this.grid.appendChild(body);

    },








    findCellElement: function (cellName) {


        return this.grid.querySelector(
            'td[data-key="' + cellName + '"]'
        );

    },







    refreshCell: function (cellName) {


        let cell = this.findCellElement(
            cellName
        );


        if (!cell) {
            return;
        }



        let display = cell.querySelector(
            ".cell-display"
        );



        let value = getCellValue(
            cellName
        );




        if (typeof value === "number") {


            display.innerText = Number(
                value.toFixed(10)
            );


            display.className =
                "cell-display number";


        }

        else if (
            typeof value === "string" &&
            value.startsWith("#")
        ) {


            display.innerText = value;


            display.className =
                "cell-display error";


        }

        else {


            display.innerText = value || "";


            display.className =
                "cell-display text";

        }

    },







    refreshCells: function (list) {


        list.forEach(function (cell) {

            UI.refreshCell(cell);

        });


    },








    selectCell: function (element) {


        if (this.selectedElement) {


            this.selectedElement.classList.remove(
                "selected"
            );

        }




        this.selectedElement = element;


        this.selectedCell =
            element.dataset.key;




        element.classList.add(
            "selected"
        );



if (this.address) {
            this.address.value = this.selectedCell;
        }



        this.formulaInput.value =
            getCellText(
                this.selectedCell
            );



        this.statusCell.innerHTML =
            "Cell: <b>" +
            this.selectedCell +
            "</b>";



        this.updateStatus();

    },







    selectByName: function (cellName) {


        let element =
            this.findCellElement(
                cellName
            );


        if (element) {

            this.selectCell(element);

        }

    },






    updateStatus: function () {


        if (!this.selectedCell) {

            this.statusValue.innerText = "";

            return;

        }



        let value =
            getCellValue(
                this.selectedCell
            );



        if (typeof value === "number") {

            this.statusValue.innerText =
                "Value: " + value;

        }

        else {

            this.statusValue.innerText = "";

        }


    },





    moveCell: function (columnMove, rowMove) {


        if (!this.selectedElement) {
            return;
        }


        let column =
            Number(
                this.selectedElement.dataset.column
            );


        let row =
            Number(
                this.selectedElement.dataset.row
            );



        column += columnMove;

        row += rowMove;



        column = Math.max(
            0,
            Math.min(
                CONFIG.columns - 1,
                column
            )
        );


        row = Math.max(
            0,
            Math.min(
                CONFIG.rows - 1,
                row
            )
        );



        this.selectByName(
            getCellName(
                column,
                row
            )
        );

    },
}

// open editor
UI.startEdit = function (startText) {


    if (!this.selectedElement) {
        return;
    }



    this.editing = true;



    let box =
        this.selectedElement.getBoundingClientRect();



    this.editor.style.display = "block";

    this.editor.style.left =
        box.left + "px";

    this.editor.style.top =
        box.top + "px";

    this.editor.style.width =
        box.width + "px";

    this.editor.style.height =
        box.height + "px";





    if (startText !== undefined) {


        this.editor.value = startText;


    } else {


        this.editor.value =
            getCellText(
                this.selectedCell
            );

    }




    this.formulaInput.value =
        this.editor.value;



    this.editor.focus();




    if (startText !== undefined) {


        this.editor.setSelectionRange(
            this.editor.value.length,
            this.editor.value.length
        );


    } else {


        this.editor.select();

    }

};







// save edited cell
UI.saveEdit = function () {


    if (!this.editing) {
        return;
    }



    this.editing = false;



    this.editor.style.display = "none";



    let text =
        this.editor.value;



    let changedCells =
        updateCell(
            this.selectedCell,
            text
        );



    this.refreshCells(
        changedCells
    );



    this.formulaInput.value =
        getCellText(
            this.selectedCell
        );


    this.updateStatus();

};








// cancel editing
UI.cancelEdit = function () {


    this.editing = false;


    this.editor.style.display =
        "none";



    this.formulaInput.value =
        getCellText(
            this.selectedCell
        );

};









// keyboard controls
UI.handleKeyboard = function (event) {



    // when editing
    if (this.editing) {


        if (event.key === "Enter") {


            event.preventDefault();


            this.saveEdit();


            this.moveCell(
                0,
                1
            );


        }



        else if (event.key === "Escape") {


            this.cancelEdit();

        }



        else if (event.key === "Tab") {


            event.preventDefault();


            this.saveEdit();


            if (event.shiftKey) {


                this.moveCell(
                    -1,
                    0
                );


            } else {


                this.moveCell(
                    1,
                    0
                );

            }

        }


        return;

    }






    // normal navigation


    if (!this.selectedCell) {
        return;
    }




    switch (event.key) {


        case "ArrowUp":

            event.preventDefault();

            this.moveCell(
                0,
                -1
            );

            break;



        case "ArrowDown":

            event.preventDefault();

            this.moveCell(
                0,
                1
            );

            break;




        case "ArrowLeft":

            event.preventDefault();

            this.moveCell(
                -1,
                0
            );

            break;



        case "ArrowRight":

            event.preventDefault();

            this.moveCell(
                1,
                0
            );

            break;

        case "Enter":

        case "F2":


            event.preventDefault();

            this.startEdit();

            break;

        case "Delete":

        case "Backspace":



            event.preventDefault();



            let affected =
                updateCell(
                    this.selectedCell,
                    ""
                );



            this.refreshCells(
                affected
            );



            this.formulaInput.value =
                "";

            this.updateStatus();

            break;

        default:
            if (
                event.key.length === 1 &&
                !event.ctrlKey &&
                !event.metaKey
            ) {


                this.startEdit(
                    event.key
                );


            }


            break;

    }

};

UI.editorChanged = function () {


    this.formulaInput.value =
        this.editor.value;

};


UI.formulaChanged = function () {


    if (this.editing) {


        this.editor.value =
            this.formulaInput.value;

    }

};


UI.formulaFocus = function () {


    if (
        !this.editing &&
        this.selectedCell
    ) {


        this.startEdit();

    }

};








// formula bar keyboard
UI.formulaKeyboard = function (event) {


    if (event.key === "Enter") {


        this.saveEdit();


        this.moveCell(
            0,
            1
        );

    }



    if (event.key === "Escape") {


        this.cancelEdit();

    }

};








// click outside editor
UI.checkOutsideClick = function (event) {


    if (!this.editing) {
        return;
    }



    let clickedEditor =
        this.editor.contains(
            event.target
        );



    let clickedFormula =
        event.target ===
        this.formulaInput;



    let clickedCell =
        event.target.closest(
            "td.cell"
        );




    if (
        !clickedEditor &&
        !clickedFormula &&
        !clickedCell
    ) {


        this.saveEdit();

    }

};



UI.addEvents = function () {


    document.addEventListener(
        "keydown",
        function (event) {

            UI.handleKeyboard(
                event
            );

        }
    );



    document.addEventListener(
        "mousedown",
        function (event) {

            UI.checkOutsideClick(
                event
            );

        }
    );


    this.editor.addEventListener(
        "input",
        function () {

            UI.editorChanged();

        }
    );



    this.formulaInput.addEventListener(
        "focus",
        function () {

            UI.formulaFocus();

        }
    );



    this.formulaInput.addEventListener(
        "input",
        function () {

            UI.formulaChanged();

        }
    );



    this.formulaInput.addEventListener(
        "keydown",
        function (event) {

            UI.formulaKeyboard(
                event
            );

        }
    );

};


UI.start = function () {


    this.createGrid();


    this.addEvents();




    let firstCell =
        this.grid.querySelector(
            "td.cell"
        );


    if (firstCell) {


        this.selectCell(
            firstCell
        );

    }

};

UI.start();
