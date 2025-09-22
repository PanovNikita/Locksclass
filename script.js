// script.js — портирование app.py в браузерную версию
// Зависимость: PapaParse (подключена в index.html)

let rawRows = []; // массив массивов (как pd.read_csv header=None)
let loadTime = null;

// ----------- Утилиты (аналогичные функциям в app.py) -----------
function normalizeRowNumber(row_num) {
    if (row_num === undefined || row_num === null) return null;
    const s = String(row_num).trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    if (Number.isNaN(n)) return null;
    return String(n).padStart(6, '0');
}

function calculateDigitDifference(num) {
    if (num === null || num === undefined) return null;
    const s = String(parseInt(num, 10));
    if (!/^\d+$/.test(s)) return null;
    if (s.length === 2) {
        return Math.abs(parseInt(s[0], 10) - parseInt(s[1], 10));
    }
    return null;
}

function getMirrorPair(number) {
    const s = String(number);
    if (s.length === 2) return parseInt(s[1] + s[0], 10);
    return null;
}

// ----------- Парсинг CSV (похож на pd.read_csv(..., dtype=str, header=None)) -----------
function parseCsvText(text) {
    // Используем PapaParse, но гарантируем, что у нас массив массивов
    const res = Papa.parse(text, { delimiter: "", newline: "", skipEmptyLines: true, dynamicTyping: false });
    // Papaparse при пустом delimiter подбирает автоматически — вернёт data как массив массивов
    const data = res.data.map(row => {
        // Нормализуем: если Papa вернул строку целиком — разобьём по запятой/пробелам
        if (!Array.isArray(row)) {
            if (typeof row === 'string') {
                // попробуем запятая, затем пробел
                if (row.includes(',')) return row.split(',').map(s => s.trim());
                return row.trim().split(/\s+/).map(s => s.trim());
            }
            return [String(row)];
        }
        // clean each cell to string
        return row.map(cell => (cell === null || cell === undefined) ? '' : String(cell).trim());
    });

    rawRows = data;
    loadTime = new Date();

    // обновляем UI
    document.getElementById('fileInfo').textContent = `data.csv загружен (время загрузки: ${loadTime.toLocaleString()}). Строк: ${rawRows.length}`;
    document.getElementById('validationStatus').textContent = 'Файл загружен. Проводим валидацию...';
    validateDataAndShow();
}

// ----------- Валидация (аналог validate_data) -----------
function validateDataAndShow() {
    const errors = validateData();
    const errEl = document.getElementById('validationErrors');
    const statusEl = document.getElementById('validationStatus');
    errEl.innerHTML = '';

    if (errors.length > 0) {
        statusEl.textContent = '❌ Обнаружены ошибки в данных:';
        errors.forEach(e => {
            const p = document.createElement('div');
            p.textContent = '• ' + e;
            errEl.appendChild(p);
        });
        // блокируем интерфейс анализа — пользователь увидит ошибки
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('showRowBtn').disabled = true;
    } else {
        statusEl.textContent = '✅ Данные прошли валидацию';
        document.getElementById('analyzeBtn').disabled = false;
        document.getElementById('showRowBtn').disabled = false;
    }
}

function validateData() {
    const errors = [];
    const df = rawRows;

    if (!df || df.length === 0) {
        errors.push('Файл пуст или не может быть прочитан.');
        return errors;
    }

    // Проверка структуры: ожидается минимум 7 колонок (индекс 0 + 6 значений)
    // Т.к. строки могут иметь разное кол-во колонок, проверим, что у ВСЕХ есть >=7 или по крайней мере у большинства
    let rowsWithEnoughCols = 0;
    for (let i = 0; i < df.length; i++) {
        const row = df[i];
        if (row.length >= 7) rowsWithEnoughCols++;
    }
    if (rowsWithEnoughCols < Math.ceil(df.length * 0.8)) {
        // если менее 80% строк имеют >=7 колонок — считаем это ошибкой
        errors.push('Недостаточно колонок в файле. Ожидается минимум 7 колонок (номер строки + 6 значений) в большинстве строк.');
        // не возвращаем сразу — продолжаем для подробных ошибок
    }

    // Проверка дубликатов номеров строк (колонка 0)
    const rowNumbers = df.map(r => (r[0] !== undefined && r[0] !== null) ? String(r[0]) : '');
    const counts = {};
    for (const rn of rowNumbers) {
        counts[rn] = (counts[rn] || 0) + 1;
    }
    const duplicates = Object.keys(counts).filter(k => counts[k] > 1 && k !== '');
    if (duplicates.length) {
        errors.push('Найдены дублирующиеся номера строк: ' + duplicates.join(', '));
    }

    // Проверка двузначных значений и отсутствующих позиций
    for (let i = 0; i < df.length; i++) {
        const row = df[i];
        const row_num = (row[0] !== undefined && row[0] !== null) ? String(row[0]) : `(строка ${i + 1})`;
        for (let col_idx = 1; col_idx <= 6; col_idx++) {
            if (col_idx < row.length) {
                const value = String(row[col_idx]).trim();
                if (value !== '' && value.toLowerCase() !== 'nan') {
                    // пытаемся целое
                    const parsed = parseInt(value, 10);
                    if (Number.isNaN(parsed)) {
                        errors.push(`Строка ${row_num}, позиция ${col_idx}: значение '${value}' не является числом`);
                    } else {
                        if (parsed < 10 || parsed > 99) {
                            errors.push(`Строка ${row_num}, позиция ${col_idx}: значение '${value}' не является двузначным числом`);
                        }
                    }
                } // пустые значения пропускаем
            } else {
                errors.push(`Строка ${row_num}: отсутствует значение в позиции ${col_idx}`);
            }
        }
    }

    return errors;
}

// ----------- Основная логика анализа (как analyze_range) -----------
function checkRangeIntegrity(startNum, endNum) {
    const missing = [];
    const existing = new Set(rawRows.map(r => (r[0] !== undefined ? String(r[0]) : '')));
    for (let i = parseInt(startNum, 10); i <= parseInt(endNum, 10); i++) {
        const rn = String(i).padStart(6, '0');
        if (!existing.has(rn)) missing.push(rn);
    }
    return missing;
}

function analyzeRange(startRange, endRange, isSkat) {
    const startNum = normalizeRowNumber(startRange);
    const endNum = normalizeRowNumber(endRange);

    if (!startNum || !endNum) {
        return { error: 'Некорректный формат диапазона' };
    }
    if (parseInt(startNum, 10) > parseInt(endNum, 10)) {
        return { error: 'Начало диапазона не может быть больше конца' };
    }

    // Проверка целостности
    const missingRows = checkRangeIntegrity(startNum, endNum);
    if (missingRows.length > 0) {
        return { error: 'В диапазоне отсутствуют строки: ' + missingRows.join(', ') };
    }

    // Фильтрация
    const filtered = rawRows.filter(r => {
        const id = r[0] !== undefined ? String(r[0]) : '';
        return id >= startNum && id <= endNum;
    });

    if (!filtered || filtered.length === 0) {
        return { error: 'Нет данных в указанном диапазоне' };
    }

    const colsToAnalyze = isSkat ? 5 : 6;
    const number_counts = {}; // {number: count}

    // Проход по строкам и позициям
    for (const row of filtered) {
        for (let col_idx = 1; col_idx <= colsToAnalyze; col_idx++) {
            if (col_idx < row.length) {
                const raw = row[col_idx];
                if (raw === undefined || raw === null) continue;
                const t = String(raw).trim();
                if (t === '' || t.toLowerCase() === 'nan') continue;
                const v = parseInt(t, 10);
                if (!Number.isNaN(v) && v >= 10 && v <= 99) {
                    number_counts[v] = (number_counts[v] || 0) + 1;

                    // В режиме СКАТ добавляем зеркальное число (как в оригинале)
                    if (isSkat) {
                        const mirror = getMirrorPair(v);
                        if (mirror !== null) {
                            number_counts[mirror] = (number_counts[mirror] || 0) + 1;
                        }
                    }
                }
            } else {
                // пропустить — аналогично оригиналу (там добавляли ошибку в валидации ранее)
            }
        }
    }

    // Группировка по штампам (разности цифр)
    const stamps = {}; // {diff: {number: display_count}}
    for (const [numStr, count] of Object.entries(number_counts)) {
        const number = parseInt(numStr, 10);
        const diff = calculateDigitDifference(number);
        if (diff !== null) {
            if (!stamps[diff]) stamps[diff] = {};
            // display_count = count * 2 (как в оригинале)
            stamps[diff][number] = count * 2;
        }
    }

    return { stamps };
}

// ----------- Форматирование результатов (format_stamp_display / format_results_for_copy) -----------
function formatStampDisplay(stampData) {
    if (!stampData) return [];
    const processed = new Set();
    const lines = [];
    // сортируем по возрастанию числа
    const numbers = Object.keys(stampData).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    for (const number of numbers) {
        if (processed.has(number)) continue;
        const count = stampData[number];
        const mirror = getMirrorPair(number);
        if (mirror && mirror !== number && stampData[mirror] !== undefined && !processed.has(mirror)) {
            const mirrorCount = stampData[mirror];
            lines.push(`${number} (${count}шт) ⇄ ${mirror} (${mirrorCount}шт)`);
            processed.add(number);
            processed.add(mirror);
        } else {
            lines.push(`${number} (${count}шт)`);
            processed.add(number);
        }
    }
    return lines;
}

function formatResultsForCopy(stamps, isSkat) {
    const lines = [];
    lines.push('=== РЕЗУЛЬТАТЫ АНАЛИЗА ===');
    lines.push('');
    lines.push('Режим: ' + (isSkat ? 'СКАТ' : 'Обычный'));
    lines.push('');
    const stampNums = Object.keys(stamps).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    for (const sn of stampNums) {
        const stampData = stamps[sn];
        if (stampData && Object.keys(stampData).length > 0) {
            lines.push('Штамп: ' + sn);
            const disp = formatStampDisplay(stampData);
            for (const l of disp) lines.push(l);
            lines.push('');
        }
    }
    return lines.join('\n').trim();
}

// ----------- UI: отрисовка результатов -----------
function renderAnalysisResult(stamps) {
    const area = document.getElementById('analysisResult');
    area.innerHTML = '';

    if (!stamps || Object.keys(stamps).length === 0) {
        area.textContent = 'Нет результатов для отображения';
        return;
    }

    const wrapper = document.createElement('div');

    // Общая сводка: штампы
    for (const stampNum of Object.keys(stamps).map(n => parseInt(n, 10)).sort((a, b) => a - b)) {
        const stampData = stamps[stampNum];
        if (!stampData || Object.keys(stampData).length === 0) continue;
        const h = document.createElement('h3');
        h.textContent = `Штамп: ${stampNum}`;
        wrapper.appendChild(h);

        const ul = document.createElement('div');
        const lines = formatStampDisplay(stampData);
        for (const l of lines) {
            const p = document.createElement('div');
            p.textContent = l;
            ul.appendChild(p);
        }
        wrapper.appendChild(ul);
    }

    area.appendChild(wrapper);
}

// ----------- UI: показать одну строку -----------
function showRow(rowNumberInput) {
    const normalized = normalizeRowNumber(rowNumberInput);
    const out = document.getElementById('rowDisplay');
    out.innerHTML = '';
    if (!normalized) {
        out.textContent = 'Некорректный номер строки';
        return;
    }
    const row = rawRows.find(r => (r[0] !== undefined ? String(r[0]) : '') === normalized);
    if (!row) {
        out.textContent = `Строка ${normalized} не найдена`;
        return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Позиция</th><th>Значение</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let i = 1; i < Math.min(7, row.length); i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>Позиция ${i}</td><td>${row[i] !== undefined ? row[i] : ''}</td>`;
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    out.appendChild(table);
}

// ----------- События UI -----------
document.getElementById('analyzeBtn').addEventListener('click', () => {
    const startRange = document.getElementById('startRange').value.trim();
    const endRange = document.getElementById('endRange').value.trim();
    const isSkat = document.getElementById('isSkat').checked;

    if (!startRange || !endRange) {
        alert('⚠️ Укажите диапазон для анализа');
        return;
    }

    document.getElementById('analysisResult').textContent = 'Анализ данных...';

    const res = analyzeRange(startRange, endRange, isSkat);
    if (res.error) {
        document.getElementById('analysisResult').textContent = 'Ошибка: ' + res.error;
        document.getElementById('copyResultsBtn').disabled = true;
        return;
    }

    renderAnalysisResult(res.stamps);

    // prepare copy text
    const formatted = formatResultsForCopy(res.stamps, isSkat);
    document.getElementById('copyResultsBtn').disabled = false;
    document.getElementById('copyResultsBtn').onclick = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(formatted).then(() => {
                alert('Результаты скопированы в буфер обмена!');
            }).catch(() => {
                // fallback
                const ta = document.createElement('textarea');
                ta.value = formatted;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); alert('Результаты скопированы в буфер обмена!'); }
                catch (e) { prompt('Скопируйте текст вручную:', formatted); }
                ta.remove();
            });
        } else {
            const ta = document.createElement('textarea');
            ta.value = formatted;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); alert('Результаты скопированы в буфер обмена!'); }
            catch (e) { prompt('Скопируйте текст вручную:', formatted); }
            ta.remove();
        }
    };
});

document.getElementById('showRowBtn').addEventListener('click', () => {
    const rowNum = document.getElementById('rowNumber').value.trim();
    if (!rowNum) { alert('Укажите номер строки'); return; }
    showRow(rowNum);
});

// ----------- Загрузка data.csv при старте -----------
fetch('data.csv')
    .then(resp => {
        if (!resp.ok) throw new Error('Не удалось загрузить data.csv — проверьте, что он лежит в корне репозитория.');
        return resp.text();
    })
    .then(text => {
        parseCsvText(text);
    })
    .catch(err => {
        document.getElementById('fileInfo').textContent = 'Ошибка: ' + err.message;
        document.getElementById('validationStatus').textContent = 'Ошибка загрузки файла';
        document.getElementById('validationErrors').textContent = err.message;
        console.error(err);
    });
