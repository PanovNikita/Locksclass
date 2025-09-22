let csvData = [];

// Загружаем CSV при старте
fetch('data.csv')
    .then(response => response.text())
    .then(text => {
        csvData = parseCSV(text);
    });

// ================== CSV ==================
function parseCSV(text) {
    return text.trim().split('\n').map(line => line.split(','));
}

// ================== Диапазоны ==================
function addRangeBlock(from = "", to = "", skat = false) {
    const container = document.getElementById("ranges-container");

    const div = document.createElement("div");
    div.className = "range-block";

    div.innerHTML = `
    <div class="range-inputs">
    От: <input type="text" class="range-from" value="${from}">
    До: <input type="text" class="range-to" value="${to}">
    </div>
    <label><input type="checkbox" class="range-skat" ${skat ? "checked" : ""}> СКАТ</label>
    <span class="remove-range">🗑</span>
  `;

    div.querySelector(".remove-range").addEventListener("click", () => {
        container.removeChild(div);
    });

    container.appendChild(div);
}

// ================== Вспомогательные функции ==================
function normalizeRowNumber(row) {
    const n = parseInt(row, 10);
    if (isNaN(n)) return null;
    return n.toString().padStart(6, '0');
}

function calculateDigitDifference(num) {
    if (!num) return null;
    const s = num.toString();
    if (s.length !== 2) return null;
    return Math.abs(parseInt(s[0]) - parseInt(s[1]));
}

function getMirrorNumber(num) {
    if (!num) return null;
    const s = num.toString();
    if (s.length !== 2) return null;
    return parseInt(s[1] + s[0]);
}

function analyzeRange(from, to, skat) {
    const startNum = normalizeRowNumber(from);
    const endNum = normalizeRowNumber(to);
    if (!startNum || !endNum || parseInt(startNum) > parseInt(endNum)) return null;

    let stamps = {};
    for (let row of csvData) {
        const rowNum = normalizeRowNumber(row[0]);
        if (!rowNum) continue;

        if (parseInt(rowNum) >= parseInt(startNum) && parseInt(rowNum) <= parseInt(endNum)) {
            const colsToAnalyze = skat ? 5 : 6;
            for (let i = 1; i <= colsToAnalyze; i++) {
                let val = parseInt(row[i]);
                if (!val || val < 10 || val > 99) continue;

                const diff = calculateDigitDifference(val);
                if (!stamps[diff]) stamps[diff] = {};

                // Увеличиваем каждое число вдвое (как в Python)
                stamps[diff][val] = (stamps[diff][val] || 0) + 2;

                if (skat) {
                    const mirror = getMirrorNumber(val);
                    if (mirror) stamps[diff][mirror] = (stamps[diff][mirror] || 0) + 2;
                }
            }
        }
    }
    return stamps;
}


function mergeStamps(stampsList) {
    const result = {};
    for (let stamps of stampsList) {
        for (let diff in stamps) {
            if (!result[diff]) result[diff] = {};
            for (let num in stamps[diff]) {
                result[diff][num] = (result[diff][num] || 0) + stamps[diff][num];
            }
        }
    }
    return result;
}

// ================== Рендер ==================
function formatStampDisplay(stampData) {
    if (!stampData) return [];
    const processed = new Set();
    const lines = [];
    const keys = Object.keys(stampData).map(Number).sort((a, b) => a - b);
    for (let num of keys) {
        if (processed.has(num)) continue;
        const mirror = getMirrorNumber(num);
        if (mirror && mirror !== num && stampData[mirror] && !processed.has(mirror)) {
            lines.push(`${num} (${stampData[num]}шт) ⇄ ${mirror} (${stampData[mirror]}шт)`);
            processed.add(num);
            processed.add(mirror);
        } else {
            lines.push(`${num} (${stampData[num]}шт)`);
            processed.add(num);
        }
    }
    return lines;
}

function renderResults(total, details) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";

    const numRanges = details.length;
    const showDetailsCheckbox = document.getElementById("show-details").checked;
    const showDetails = showDetailsCheckbox && numRanges > 1; // <-- исправлено

    // Итоговый результат
    const totalDiv = document.createElement("div");
    totalDiv.className = "results-block";
    let html = "<h3>Итоговый результат</h3>";

    for (let diff in total) {
        html += `<h4>Штамп ${diff}</h4>`;
        html += "<ul>";
        for (let line of formatStampDisplay(total[diff])) html += `<li>${line}</li>`;
        html += "</ul>";
    }
    totalDiv.innerHTML = html;
    resultsDiv.appendChild(totalDiv);

    // Промежуточные результаты (только если чекбокс отмечен и диапазонов > 1)
    if (showDetails) {
        details.forEach((d, idx) => {
            const block = document.createElement("div");
            block.className = "results-block";
            let blockHtml = `<h3>Диапазон ${d.from}-${d.to} ${d.skat ? "(СКАТ)" : ""}</h3>`;
            for (let diff in d.stamps) {
                blockHtml += `<h4>Штамп ${diff}</h4><ul>`;
                for (let line of formatStampDisplay(d.stamps[diff])) blockHtml += `<li>${line}</li>`;
                blockHtml += "</ul>";
            }
            block.innerHTML = blockHtml;
            resultsDiv.appendChild(block);
        });
    }
}



// ================== Анализ нескольких диапазонов ==================
function analyzeRanges() {
    const blocks = document.querySelectorAll(".range-block");
    const stampsList = [];
    const details = [];

    for (let block of blocks) {
        const from = block.querySelector(".range-from").value;
        const to = block.querySelector(".range-to").value;
        const skat = block.querySelector(".range-skat").checked;
        const stamps = analyzeRange(from, to, skat);
        if (!stamps) continue;

        stampsList.push(stamps);
        details.push({ from, to, skat, stamps });
    }

    const total = mergeStamps(stampsList);
    renderResults(total, details);
}

// ================== Просмотр строки ==================
function showRow() {
    const num = document.getElementById("row-number").value;
    const normalized = normalizeRowNumber(num);
    const div = document.getElementById("row-result");

    if (!normalized) {
        div.innerHTML = "Некорректный номер строки";
        return;
    }

    const row = csvData.find(r => normalizeRowNumber(r[0]) === normalized);
    if (!row) {
        div.innerHTML = `Строка ${normalized} не найдена`;
        return;
    }

    let html = "<table><tr><th>Значение</th></tr>";
    for (let i = 1; i <= 6 && i < row.length; i++) html += `<tr><td>${row[i]}</td></tr>`;
    html += "</table>";
    div.innerHTML = html;
}

// ================== Навешиваем обработчики ==================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("add-range").addEventListener("click", () => addRangeBlock());
    document.getElementById("analyze").addEventListener("click", analyzeRanges);
    document.getElementById("show-row").addEventListener("click", showRow);

    // Один диапазон по умолчанию
    addRangeBlock();
});
