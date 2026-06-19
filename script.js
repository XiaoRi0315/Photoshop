let currentQuiz = []; 
let userAnswers = {}; 
let tempAnswers = {}; 
let currentQuestionIndex = 0;
let questionOptionOrders = {}; 

// 自動解析圖片路徑與 [img:路徑]、[big-img:路徑]、[opt-img:路徑] 標籤
function formatText(text) {
    if (!text) return '';
    
    // 新增：如果傳入的是陣列（例如一個選項有兩張圖片），將陣列內的每個項目分別處理後再合併
    if (Array.isArray(text)) {
        return text.map(item => formatText(item)).join('<span style="margin: 0 5px;"></span>');
    }

    text = String(text);
    
    // 1. 如果整個字串就是一個圖片路徑 (選項的預設中型圖片)
    if (/^\S+\.(png|jpe?g|gif|svg|webp)$/i.test(text.trim())) {
        return `<img src="${text.trim()}" class="quiz-option-image" alt="選項圖片">`;
    }
    
    // 2. 解析「大圖」標籤 [big-img:路徑]
    text = text.replace(/\[big-img:(.*?)\]/gi, '<img src="$1" class="quiz-large-image" alt="大圖片">');

    // 3. 新增：解析「選項中圖」標籤 [opt-img:路徑] (適用於一選項有多圖或圖文並排的情況)
    text = text.replace(/\[opt-img:(.*?)\]/gi, '<img src="$1" class="quiz-option-image" alt="選項圖片">');
    
    // 4. 解析「文字中夾帶的小圖」標籤 [img:路徑]
    text = text.replace(/\[img:(.*?)\]/gi, '<img src="$1" class="quiz-inline-image" alt="文字圖片">');
    
    return text;
}

function getColorVariables() {
    const root = document.documentElement;
    return {
        correctColor: getComputedStyle(root).getPropertyValue('--color-green-text'),
        wrongColor: getComputedStyle(root).getPropertyValue('--color-red-text'),
        defaultColor: getComputedStyle(root).getPropertyValue('--color-text-light'),
    };
}

function adjustFontSize(size) {
    const root = document.documentElement;
    const sizeMap = {
        's': 'var(--font-s)', 'm': 'var(--font-m)', 'l': 'var(--font-l)', 'xl': 'var(--font-xl)', 'xxl': 'var(--font-xxl)'
    };
    root.style.setProperty('--current-font-size', sizeMap[size] || sizeMap['m']);
    localStorage.setItem('fontSize', size);
    document.querySelectorAll('.adjustable-text').forEach(el => {
        el.style.fontSize = getComputedStyle(root).getPropertyValue('--current-font-size');
    });
}

function toggleTheme() {
    const body = document.body;
    const isDarkMode = body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateButtonColors();
    if (document.getElementById('quiz-screen').style.display !== 'none') {
        const userAnswer = userAnswers[currentQuestionIndex];
        if (userAnswer !== undefined) renderFeedback(currentQuestionIndex);
    }
}

function updateButtonColors() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) toggleBtn.innerHTML = isDarkMode ? '☀️' : '🌙'; 
    if (document.getElementById('quiz-screen').style.display !== 'none') updateNavigationButtons();
}

function renderFilters() {
    // 讀取並還原題目類型的選擇
    const storedTypes = JSON.parse(localStorage.getItem('selectedTypes') || '[]');
    storedTypes.forEach(type => {
        let idMap = {'是非題': 'type-tf', '選擇題': 'type-single', '複選題': 'type-multiple'};
        const checkbox = document.getElementById(idMap[type]);
        if (checkbox) checkbox.checked = true;
    });

    // 讀取並還原抽題數量的選擇
    const storedCountSetting = localStorage.getItem('quizCountSetting');
    if (storedCountSetting) {
        const countRadio = document.querySelector(`input[name="quiz-count"][value="${storedCountSetting}"]`);
        if (countRadio) {
            countRadio.checked = true;
        }
    }
}

function startTraining() {
    const selectedTypes = Array.from(document.querySelectorAll('#topic-filters input:checked')).map(cb => cb.value);
    const countSetting = document.querySelector('input[name="quiz-count"]:checked').value;

    if (selectedTypes.length === 0) {
        showMessageBox('請至少選擇一種「題目類型」！');
        return;
    }

    let filteredData = quizData.filter(q => selectedTypes.includes(q.type));

    if (filteredData.length === 0) {
        showMessageBox(`該範圍內沒有任何題目，請重新選擇。`);
        return;
    }

    // 儲存使用者的選擇
    localStorage.setItem('selectedTypes', JSON.stringify(selectedTypes));
    localStorage.setItem('quizCountSetting', countSetting);
    
    filteredData.sort(() => 0.5 - Math.random());

    if (countSetting === '10') {
        currentQuiz = filteredData.slice(0, 10);
    } else if (countSetting === '50') {
        currentQuiz = filteredData.slice(0, 50);
    } else {
        currentQuiz = filteredData; 
    }
    
    userAnswers = {}; 
    tempAnswers = {}; 
    currentQuestionIndex = 0;
    questionOptionOrders = {}; 

    // 判斷是否需要洗牌的邏輯
    currentQuiz.forEach((q, idx) => {
        let availableKeys = Object.keys(q).filter(k => /^[A-Z]$/.test(k)).sort();
        let shouldShuffle = true;

        if (q.type === '是非題') {
            shouldShuffle = false;
        } else if (q.type === '選擇題') {
            const values = availableKeys.map(k => String(q[k]).trim());
            if (values.join(',') === 'A,B,C,D') {
                shouldShuffle = false;
            }
        }

        if (shouldShuffle) {
            questionOptionOrders[idx] = availableKeys.sort(() => 0.5 - Math.random());
        } else {
            questionOptionOrders[idx] = availableKeys; 
        }
    });
    
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';

    renderQuestion(currentQuestionIndex);
    updateIndexNav();
    updateNavigationButtons();
}

function renderQuestion(index) {
    const question = currentQuiz[index];
    if (!question) return;
    const container = document.getElementById('quiz-card-container');
    
    const randomizedKeys = questionOptionOrders[index];
    const userAnswer = userAnswers[index];
    const isAnswered = userAnswer !== undefined;
    const isMultipleChoice = question.type === '複選題';

    const optionsHTML = randomizedKeys.map((key, orderIdx) => {
        let labelClass = 'option-label adjustable-text';
        let disabledAttr = isAnswered ? 'disabled' : '';
        
        let isChecked = false;
        if (isAnswered) {
            isChecked = Array.isArray(userAnswer) ? userAnswer.includes(key) : userAnswer === key;
        } else if (tempAnswers[index]) {
            isChecked = Array.isArray(tempAnswers[index]) ? tempAnswers[index].includes(key) : tempAnswers[index] === key;
        }

        // 渲染顏色狀態
        if (isAnswered) {
            const correctAnswers = Array.isArray(question.answer) ? question.answer : [question.answer];
            const userSelected = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
            
            if (correctAnswers.includes(key)) {
                labelClass += ' correct-highlight'; 
            } else if (userSelected.includes(key)) {
                labelClass += ' wrong-highlight'; 
            }
        } else if (isChecked && isMultipleChoice) {
            labelClass += ' temp-selected-highlight';
        }

        const displayLetter = String.fromCharCode(65 + orderIdx); 
        const inputType = isMultipleChoice ? 'checkbox' : 'radio';

        return `
            <li class="option-item">
                <label for="q${index}-option-${key}" class="${labelClass}" id="label-q${index}-option-${key}">
                    <input type="${inputType}" id="q${index}-option-${key}" name="question-${index}" value="${key}" 
                        ${isChecked ? 'checked' : ''} ${disabledAttr}
                        onclick="handleOptionChange('${key}', '${question.type}')" style="display: none;">
                    <span style="font-weight: 700; margin-right: 10px; flex-shrink: 0;">${displayLetter}.</span> 
                    <span class="option-content" style="flex-grow: 1;">${formatText(question[key])}</span>
                </label>
            </li>
        `;
    }).join('');

    // 動態判斷圖片是單一字串還是陣列，支援一題多圖
    let imageHTML = '';
    if (question.image) {
        if (Array.isArray(question.image)) {
            imageHTML = question.image
                .filter(img => img.trim() !== "")
                .map(img => `<img src="${img}" class="quiz-image" alt="題目附圖">`)
                .join('');
        } else if (typeof question.image === 'string' && question.image.trim() !== "") {
            imageHTML = `<img src="${question.image}" class="quiz-image" alt="題目附圖">`;
        }
    }

    container.innerHTML = `
        <div class="quiz-card adjustable-text">
            <div style="font-weight: 700; color: var(--color-text-light); margin-bottom: 10px;">[${question.type}]</div>
            <p class="question-text">Q${index + 1}/${currentQuiz.length}. ${formatText(question.question)}</p>
            ${imageHTML}
            <ul class="options-list">${optionsHTML}</ul>
            ${isMultipleChoice && !isAnswered ? `<button id="confirm-btn-${index}" class="btn btn-primary confirm-answer-btn" onclick="confirmAnswer(${index})">確認作答</button>` : ''}
        </div>
    `;
    
    container.querySelectorAll('.adjustable-text').forEach(el => {
        el.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue('--current-font-size');
    });

    if (isAnswered) renderFeedback(index);
    else document.getElementById('feedback-area').innerHTML = '';

    updateNavigationButtons();
    updateIndexNav(index);
}

function handleOptionChange(key, qType) {
    if (qType === '複選題') {
        if (!tempAnswers[currentQuestionIndex]) tempAnswers[currentQuestionIndex] = [];
        const idx = tempAnswers[currentQuestionIndex].indexOf(key);
        if (idx > -1) {
            tempAnswers[currentQuestionIndex].splice(idx, 1); 
        } else {
            tempAnswers[currentQuestionIndex].push(key); 
        }
        renderQuestion(currentQuestionIndex); 
    } else {
        // 是非題、選擇題 -> 點擊後直接即時確認
        userAnswers[currentQuestionIndex] = key;
        renderQuestion(currentQuestionIndex); 
    }
}

function confirmAnswer(index) {
    let selected = tempAnswers[index];
    if (!selected || (Array.isArray(selected) && selected.length === 0)) {
        showMessageBox('請至少選擇一個答案再確認！');
        return;
    }
    userAnswers[index] = [...selected].sort();
    renderQuestion(index); 
}

function renderFeedback(index) {
    const question = currentQuiz[index];
    const userAnswer = userAnswers[index];
    
    const correctAnswers = Array.isArray(question.answer) ? [...question.answer].sort() : [question.answer];
    const userSelected = Array.isArray(userAnswer) ? [...userAnswer].sort() : [userAnswer];
    
    const isCorrect = JSON.stringify(correctAnswers) === JSON.stringify(userSelected);

    const feedbackArea = document.getElementById('feedback-area');
    const itemClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
    const icon = isCorrect ? '✅ 答對了！' : '❌ 答錯了...';
    const colors = getColorVariables();
    
    // 利用 formatText 解析選項文字或圖片
    const correctText = correctAnswers.map(ans => formatText(question[ans])).join('、');
    const userText = userSelected.length > 0 && userSelected[0] ? userSelected.map(ans => formatText(question[ans])).join('、') : '未作答';

    feedbackArea.innerHTML = `
        <div class="feedback-box adjustable-text ${itemClass}">
            <div class="feedback-title">
                <span>${icon}</span>
                <span style="font-weight: 500; font-size: 0.9rem; color: var(--color-text-light);">(${question.type})</span>
            </div>
            <p>您的選擇: <span style="color: ${isCorrect ? colors.correctColor : colors.wrongColor};">${userText}</span></p>
            ${!isCorrect ? `<p>正確答案: <span style="color: ${colors.correctColor};">${correctText}</span></p>` : ''}
            <div class="feedback-explanation"><span style="font-weight: 700;">解析:</span> ${formatText(question.explanation)}</div>
        </div>
    `;
}

function updateNavigationButtons() {
    document.getElementById('prev-btn').disabled = currentQuestionIndex === 0;
    document.getElementById('next-btn').disabled = currentQuestionIndex >= currentQuiz.length - 1;
}

function navigateQuiz(direction) {
    const newIndex = currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < currentQuiz.length) {
        currentQuestionIndex = newIndex;
        renderQuestion(currentQuestionIndex);
        document.querySelector('.container').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 更新題號導覽區的狀態
function updateIndexNav(activeIndex = currentQuestionIndex) {
    const navContainer = document.getElementById('question-index-nav');
    navContainer.innerHTML = currentQuiz.map((_, index) => {
        // 判斷是否已經有正式作答紀錄
        const isAnswered = userAnswers.hasOwnProperty(index);
        const isActive = index === activeIndex;
        
        let className = 'index-btn';
        if (isActive) {
            className += ' active-index';
        } else if (isAnswered) {
            className += ' answered-index';
        }
        
        return `<button class="${className}" onclick="jumpToQuestion(${index})">${index + 1}</button>`;
    }).join('');
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    renderQuestion(currentQuestionIndex);
    document.querySelector('.container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 新增交卷確認判斷邏輯
function submitQuiz() {
    const total = currentQuiz.length;
    const answeredCount = Object.keys(userAnswers).length;
    const unansweredCount = total - answeredCount;
    
    // 如果有未答題目，跳出確認視窗；如果全答完，直接結算
    if (unansweredCount > 0) {
        showConfirmBox(`您還有 <span style="color: var(--color-red-text); font-size: 1.3em;">${unansweredCount}</span> 題尚未作答或確認！<br>確定要現在結束測驗並看成績嗎？`, () => {
            processSubmission(total);
        });
    } else {
        processSubmission(total);
    }
}

// 獨立的結算與換頁邏輯
function processSubmission(total) {
    let correctCount = 0;

    const results = currentQuiz.map((q, index) => {
        const correctAnswers = Array.isArray(q.answer) ? [...q.answer].sort() : [q.answer];
        
        // 處理使用者未作答的情況
        let userSelected = [];
        if (userAnswers[index]) {
            userSelected = Array.isArray(userAnswers[index]) ? [...userAnswers[index]].sort() : [userAnswers[index]];
        }
        
        const isCorrect = userSelected.length > 0 && JSON.stringify(correctAnswers) === JSON.stringify(userSelected);
        
        if (isCorrect) correctCount++;
        
        return { 
            index: index + 1, 
            question: q.question, 
            userAnswer: userSelected, 
            correctAnswer: correctAnswers, 
            isCorrect, 
            explanation: q.explanation, 
            options: q, 
            type: q.type 
        };
    });

    const score = Math.round((correctCount / total) * 100);
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('result-screen').style.display = 'block';
    renderResultScreen(score, correctCount, total, results);
}

function renderResultScreen(score, correctCount, total, results) {
    const encouragementDiv = document.getElementById('result-score');
    const detailDiv = document.getElementById('result-details');
    const colors = getColorVariables();
    let level = score > 80 ? {c:'level-3', m:'優秀！掌握度極高。', i:'🏆'} : (score > 50 ? {c:'level-2', m:'不錯！再接再厲。', i:'👍'} : {c:'level-1', m:'加油，建議多複習。', i:'😓'});

    encouragementDiv.className = `encouragement adjustable-text ${level.c}`;
    encouragementDiv.innerHTML = `<div class="score-display"><span>${level.i}</span> ${score} 分</div><p>${level.m}</p><p>答對 ${correctCount}/${total} 題</p>`;

    detailDiv.innerHTML = results.map(item => {
        const correctText = item.correctAnswer.map(ans => formatText(item.options[ans])).join('、');
        const userText = item.userAnswer.length > 0 && item.userAnswer[0] ? item.userAnswer.map(ans => formatText(item.options[ans])).join('、') : '未作答';
        
        // 新增未作答的狀態判斷
        const isUnanswered = item.userAnswer.length === 0;
        const statusText = isUnanswered ? '⚪ 未答' : (item.isCorrect ? '✅ 答對' : '❌ 答錯');
        const itemClass = isUnanswered ? 'unanswered' : (item.isCorrect ? 'correct' : 'incorrect');

        return `
        <div class="result-item ${itemClass}">
            <div>Q${item.index}. ${statusText} (${item.type})</div>
            <p>${formatText(item.question)}</p>
            <div class="result-detail">
                <p>您的選擇: <span style="color:${item.isCorrect ? colors.correctColor : (isUnanswered ? colors.defaultColor : colors.wrongColor)}">${userText}</span></p>
                <p>正確答案: <span style="color:${colors.correctColor}">${correctText}</span></p>
                <div class="explanation-text">解析: ${formatText(item.explanation)}</div>
            </div>
        </div>
    `}).join('');
}

// 一般的訊息提示框
function showMessageBox(message) {
    const msgBox = document.createElement('div');
    msgBox.style.cssText = `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:30px; background:var(--color-container-bg); border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:1000; text-align:center; border:3px solid var(--color-primary); color:var(--color-text); width: 80%; max-width: 400px;`;
    msgBox.innerHTML = `<p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 20px;">${message}</p><button class="btn btn-primary" onclick="this.parentNode.remove()">確定</button>`;
    document.body.appendChild(msgBox);
}

// 詢問是否確定交卷的對話框
function showConfirmBox(message, onConfirm) {
    const msgBox = document.createElement('div');
    msgBox.style.cssText = `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:30px; background:var(--color-container-bg); border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.3); z-index:1000; text-align:center; border:3px solid var(--color-primary); color:var(--color-text); width: 80%; max-width: 400px;`;
    
    msgBox.innerHTML = `
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 25px; line-height: 1.5;">${message}</p>
        <div style="display: flex; justify-content: center; gap: 15px;">
            <button class="btn" style="background-color: #eee; color: #333; border: 1px solid #ccc; box-shadow: 0 4px 0 #ccc;" onclick="this.parentNode.parentNode.remove()">繼續作答</button>
            <button class="btn btn-primary" id="confirm-yes-btn">確定交卷</button>
        </div>
    `;
    document.body.appendChild(msgBox);

    document.getElementById('confirm-yes-btn').onclick = () => {
        msgBox.remove();
        if (typeof onConfirm === 'function') onConfirm();
    };
}

window.onload = () => {
    adjustFontSize(localStorage.getItem('fontSize') || 'm');
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
    updateButtonColors();
    renderFilters();
};
