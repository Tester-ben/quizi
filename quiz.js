const OUTLINE_BATCH_SIZE = 20;
const RANDOM_BATCH_SIZE = 45;
const DEFAULT_RANGE_START = 1;
const DEFAULT_RANGE_END = 20;
const STORAGE_KEY = "quiz_outline_cursor_v1";
const HISTORY_KEY = "quiz_latest_result_v1";
const RANDOM_USED_KEY = "quiz_random_used_question_ids_v1";

const state = {
  mode: "fixed",
  questions: [],
  submitted: false,
  startTime: null,
  timer: null,
  elapsedSeconds: 0,
  lastQuizSeed: null,
  activeRange: { start: DEFAULT_RANGE_START, end: DEFAULT_RANGE_END },
  activeOutlineRange: { start: DEFAULT_RANGE_START, end: DEFAULT_RANGE_END },
  randomAllowRepeat: false
};

const modeConfig = {
  fixed: {
    title: "Làm theo khoảng câu",
    subtitle: "Nhập câu bắt đầu và câu kết thúc. Ví dụ 5–45 sẽ lấy toàn bộ câu 5 đến 45, không giới hạn 20 câu.",
    label: "Khoảng câu"
  },
  outline: {
    title: "Đảo câu theo khoảng",
    subtitle: "Chọn khoảng câu rồi đảo lộn thứ tự câu trong khoảng đó. Đáp án A/B/C/D cũng được đảo ngẫu nhiên.",
    label: "Đảo câu"
  },
  random: {
    title: "Random 45 câu",
    subtitle: "Random 45 câu không trùng qua từng lượt. Có thể reset random hoặc random lại có trùng lặp.",
    label: "Random"
  },
  wrong: {
    title: "Làm lại câu sai",
    subtitle: "Chỉ lấy các câu bạn làm sai hoặc chưa chọn ở bài vừa nộp để luyện lại.",
    label: "Câu sai"
  },
  bank: {
    title: "Ngân hàng câu hỏi",
    subtitle: "Xem và tìm nhanh toàn bộ câu hỏi đã nhập.",
    label: "Ngân hàng"
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function showConfirmModal({ title, message, confirmText = "Đồng ý", cancelText = "Hủy" }) {
  const overlay = $("#confirmModal");
  const titleEl = $("#confirmModalTitle");
  const messageEl = $("#confirmModalMessage");
  const confirmBtn = $("#confirmModalConfirm");
  const cancelBtn = $("#confirmModalCancel");
  const closeBtn = $("#confirmModalClose");

  if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !closeBtn) {
    return Promise.resolve(confirm(message || title || "Bạn chắc chắn chứ?"));
  }

  titleEl.textContent = title || "Xác nhận thao tác";
  messageEl.textContent = message || "Bạn chắc chắn muốn tiếp tục?";
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  return new Promise(resolve => {
    let resolved = false;

    const cleanup = (value) => {
      if (resolved) return;
      resolved = true;
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeydown);
      resolve(value);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (event) => {
      if (event.target === overlay) cleanup(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") cleanup(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);

    window.setTimeout(() => cancelBtn.focus(), 40);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatTime(seconds) {
  const min = Math.floor(seconds / 60).toString().padStart(2, "0");
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function getBank() {
  return Array.isArray(window.QUIZ_BANK) ? window.QUIZ_BANK : [];
}

function getOutlineCursor() {
  return Number(localStorage.getItem(STORAGE_KEY) || 0);
}

function setOutlineCursor(value) {
  const bank = getBank();
  const safeValue = bank.length ? value % bank.length : 0;
  localStorage.setItem(STORAGE_KEY, String(safeValue));
}
function getRandomUsedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RANDOM_USED_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch (error) {
    return new Set();
  }
}

function setRandomUsedIds(usedIds) {
  localStorage.setItem(RANDOM_USED_KEY, JSON.stringify(Array.from(usedIds).map(String)));
}

function resetRandomProgress(silent = false) {
  localStorage.removeItem(RANDOM_USED_KEY);
  updateStats();
  if (!silent) alert("Đã reset phần random. Bạn có thể random lại từ đầu.");
}

function getWrongQuestions() {
  return state.questions.filter(question => question.userAnswer !== question.answer);
}

function setSidebarActive(activeKey) {
  const homeBtn = $("#homeSidebarBtn");
  const wrongBtn = $("#wrongSidebarBtn");
  if (homeBtn) homeBtn.classList.toggle("active", activeKey === "home");
  if (wrongBtn) wrongBtn.classList.toggle("active", activeKey === "wrong");
}

function updateWrongSidebarButton() {
  const wrongBtn = $("#wrongSidebarBtn");
  if (!wrongBtn) return;
  const wrongCount = state.submitted ? getWrongQuestions().length : 0;
  wrongBtn.disabled = wrongCount === 0;
  const strong = wrongBtn.querySelector("strong");
  if (strong) strong.textContent = wrongCount ? `Câu làm sai (${wrongCount})` : "Câu làm sai";
}

function getQuestionKey(question) {
  return String(question?.id ?? question?.code ?? question?.question ?? "");
}

function getRandomQuestionsWithoutRepeat() {
  const bank = getBank();
  if (!bank.length) return [];

  let usedIds = getRandomUsedIds();
  let available = bank.filter(question => !usedIds.has(getQuestionKey(question)));

  if (!available.length) {
    const shouldReset = confirm("Bạn đã làm hết toàn bộ câu random không trùng. Bạn muốn reset random để làm lại từ đầu không?");
    if (!shouldReset) return null;
    resetRandomProgress(true);
    usedIds = getRandomUsedIds();
    available = [...bank];
  }

  if (available.length < RANDOM_BATCH_SIZE) {
    const shouldContinue = confirm(`Bạn đã làm hết, còn ${available.length} câu thôi. Bạn muốn random không?`);
    if (!shouldContinue) return null;
  }

  const selected = shuffleArray(available).slice(0, Math.min(RANDOM_BATCH_SIZE, available.length));
  selected.forEach(question => usedIds.add(getQuestionKey(question)));
  setRandomUsedIds(usedIds);
  return selected.map(question => normalizeQuizQuestion(question, true));
}

function getRandomQuestionsWithRepeat() {
  const bank = getBank();
  return shuffleArray(bank).slice(0, Math.min(RANDOM_BATCH_SIZE, bank.length)).map(question => normalizeQuizQuestion(question, true));
}


function normalizeQuizQuestion(question, shouldShuffleOptions) {
  const originalOptions = Array.isArray(question.options) ? question.options : [];
  const options = shouldShuffleOptions ? shuffleArray(originalOptions) : [...originalOptions];
  const displayLetterByOptionId = {};
  options.forEach((option, optionIndex) => {
    displayLetterByOptionId[option.id] = String.fromCharCode(65 + optionIndex);
  });
  return {
    ...question,
    displayOptions: options,
    displayLetterByOptionId,
    userAnswer: null
  };
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function getSelectedRange() {
  const bank = getBank();
  const total = bank.length || DEFAULT_RANGE_END;
  let start = clampNumber($("#rangeStart")?.value || DEFAULT_RANGE_START, 1, total);
  let end = clampNumber($("#rangeEnd")?.value || Math.min(DEFAULT_RANGE_END, total), 1, total);
  if (start > end) [start, end] = [end, start];
  return { start, end, count: end - start + 1 };
}

function getSelectedOutlineRange() {
  const bank = getBank();
  const total = bank.length || DEFAULT_RANGE_END;
  let start = clampNumber($("#outlineRangeStart")?.value || DEFAULT_RANGE_START, 1, total);
  let end = clampNumber($("#outlineRangeEnd")?.value || Math.min(DEFAULT_RANGE_END, total), 1, total);
  if (start > end) [start, end] = [end, start];
  return { start, end, count: end - start + 1 };
}

function syncRangeInputs() {
  const bank = getBank();
  const total = bank.length || DEFAULT_RANGE_END;
  const startInput = $("#rangeStart");
  const endInput = $("#rangeEnd");
  if (!startInput || !endInput) return;
  startInput.max = String(total);
  endInput.max = String(total);
  if (!startInput.value) startInput.value = String(DEFAULT_RANGE_START);
  if (!endInput.value) endInput.value = String(Math.min(DEFAULT_RANGE_END, total));
}

function syncOutlineRangeInputs() {
  const bank = getBank();
  const total = bank.length || DEFAULT_RANGE_END;
  const startInput = $("#outlineRangeStart");
  const endInput = $("#outlineRangeEnd");
  if (!startInput || !endInput) return;
  startInput.max = String(total);
  endInput.max = String(total);
  if (!startInput.value) startInput.value = String(DEFAULT_RANGE_START);
  if (!endInput.value) endInput.value = String(Math.min(DEFAULT_RANGE_END, total));
}

function getQuestionsForMode(mode, options = {}) {
  const bank = getBank();
  if (!bank.length) return [];

  if (mode === "fixed") {
    const range = getSelectedRange();
    state.activeRange = range;
    const selected = bank.slice(range.start - 1, range.end);
    return selected.map(q => normalizeQuizQuestion(q, true));
  }

  if (mode === "outline") {
    const range = getSelectedOutlineRange();
    state.activeOutlineRange = range;
    const selected = bank.slice(range.start - 1, range.end);
    return shuffleArray(selected).map(q => normalizeQuizQuestion(q, true));
  }

  if (mode === "random") {
    return options.allowRepeat ? getRandomQuestionsWithRepeat() : getRandomQuestionsWithoutRepeat();
  }

  return [];
}

function setMode(mode) {
  state.mode = mode;
  const config = modeConfig[mode] || modeConfig.fixed;
  $("#pageTitle").textContent = config.title;
  $("#pageSubtitle").textContent = config.subtitle;
  $("#currentModeLabel").textContent = config.label;

  $$('[data-mode-card]').forEach(card => card.classList.toggle("selected", card.dataset.modeCard === mode));
  updateWrongSidebarButton();

  if (mode === "bank") {
    showBank();
  }
}

function showHome() {
  stopTimer();
  setSidebarActive("home");
  $("#homePanel").classList.remove("hidden");
  $("#quizPanel").classList.add("hidden");
  $("#resultPanel").classList.add("hidden");
  $("#bankPanel").classList.add("hidden");
  $("#statsPanel").classList.remove("hidden");
  updateStats();
}

function showQuiz() {
  setSidebarActive(null);
  $("#homePanel").classList.add("hidden");
  $("#bankPanel").classList.add("hidden");
  $("#resultPanel").classList.add("hidden");
  $("#quizPanel").classList.remove("hidden");
  $("#statsPanel").classList.remove("hidden");
}

function showBank() {
  stopTimer();
  setSidebarActive(null);
  $("#homePanel").classList.add("hidden");
  $("#quizPanel").classList.add("hidden");
  $("#resultPanel").classList.add("hidden");
  $("#statsPanel").classList.add("hidden");
  $("#bankPanel").classList.remove("hidden");
  renderBank();
}

function startQuiz(mode = state.mode, options = {}) {
  if (mode === "bank") mode = "fixed";
  setMode(mode);
  const selectedQuestions = getQuestionsForMode(mode, options);
  if (selectedQuestions === null) return;

  state.randomAllowRepeat = mode === "random" ? !!options.allowRepeat : false;
  state.questions = selectedQuestions;
  state.submitted = false;
  state.elapsedSeconds = 0;
  updateWrongSidebarButton();

  if (!state.questions.length) {
    alert("Chưa có dữ liệu câu hỏi. Kiểm tra file quiz-data.js nha.");
    return;
  }

  renderQuiz();
  showQuiz();
  startTimer();
  updateStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startTimer() {
  stopTimer();
  state.startTime = Date.now();
  $("#timerText").textContent = "00:00";
  state.timer = window.setInterval(() => {
    state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
    $("#timerText").textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function renderQuiz() {
  const config = modeConfig[state.mode] || modeConfig.fixed;
  $("#quizTitle").textContent = config.title;

  let meta = `${state.questions.length} câu trắc nghiệm`;
  if (state.mode === "fixed") {
    meta += ` • Câu ${state.activeRange.start}–${state.activeRange.end}`;
  }
  if (state.mode === "outline") {
    meta += ` • Đảo câu ${state.activeOutlineRange.start}–${state.activeOutlineRange.end}`;
  }
  if (state.mode === "random") {
    meta += state.randomAllowRepeat ? " • Có thể trùng lặp" : " • Không trùng lặp";
  }
  $("#quizMeta").textContent = meta;

  const html = state.questions.map((question, index) => {
    const optionsHtml = question.displayOptions.map((option, optionIndex) => {
      const displayLetter = String.fromCharCode(65 + optionIndex);
      return `
        <label class="option-item" data-question-index="${index}" data-option-id="${escapeHtml(option.id)}">
          <input type="radio" name="question-${index}" value="${escapeHtml(option.id)}" />
          <span class="option-letter">${displayLetter}</span>
          <span>${escapeHtml(option.text)}</span>
        </label>`;
    }).join("");

    return `
      <article class="question-card" id="question-${index}">
        <div class="question-head">
          <div>
            <div class="question-number">Câu ${index + 1} <span class="question-code">${escapeHtml(question.code || `ID ${question.id}`)}</span></div>
            <p class="question-text">${escapeHtml(question.question)}</p>
          </div>
        </div>
        <div class="option-list">${optionsHtml}</div>
      </article>`;
  }).join("");

  $("#quizForm").innerHTML = html;

  $$("#quizForm input[type='radio']").forEach(input => {
    input.addEventListener("change", handleAnswerChange);
  });
}

function handleAnswerChange(event) {
  const name = event.target.name;
  const index = Number(name.replace("question-", ""));
  if (state.questions[index]) {
    state.questions[index].userAnswer = event.target.value;
  }
  updateStats();
}

function updateStats() {
  const defaultTotal = state.mode === "random"
    ? Math.min(RANDOM_BATCH_SIZE, getBank().length || RANDOM_BATCH_SIZE)
    : (state.mode === "outline" ? getSelectedOutlineRange().count : 0);
  const total = state.questions.length || defaultTotal;
  const answered = state.questions.filter(q => q.userAnswer).length;

  // Không tính/hiển thị số câu đúng trong lúc đang làm bài.
  // Số câu đúng chỉ được chấm sau khi bấm "Nộp bài" trong submitQuiz().
  $("#answeredCount").textContent = `${answered}/${total}`;
  $("#totalQuestionCount").textContent = String(getBank().length);
}

function submitQuiz() {
  if (!state.questions.length) return;
  const unanswered = state.questions.filter(q => !q.userAnswer).length;
  if (unanswered > 0) {
    const ok = confirm(`Bạn còn ${unanswered} câu chưa chọn. Bạn vẫn muốn nộp bài chứ?`);
    if (!ok) return;
  }

  stopTimer();
  state.submitted = true;
  const correct = state.questions.filter(q => q.userAnswer === q.answer).length;
  const total = state.questions.length;
  const percent = Math.round((correct / total) * 100);

  const nextBatchBtn = $("#nextBatchBtn");
  if (nextBatchBtn) {
    if (state.mode === "outline" || state.mode === "wrong") {
      nextBatchBtn.style.display = "none";
    } else if (state.mode === "random" && !state.randomAllowRepeat) {
      nextBatchBtn.style.display = "";
      nextBatchBtn.textContent = "Random tiếp không trùng";
    } else {
      nextBatchBtn.style.display = "none";
    }
  }

  const wrongOnlyBtn = $("#wrongOnlyBtn");
  if (wrongOnlyBtn) {
    const wrongCount = getWrongQuestions().length;
    wrongOnlyBtn.style.display = wrongCount ? "" : "none";
    wrongOnlyBtn.textContent = wrongCount ? `Làm lại ${wrongCount} câu sai` : "Làm lại câu sai";
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify({
    mode: state.mode,
    correct,
    total,
    percent,
    elapsedSeconds: state.elapsedSeconds,
    completedAt: new Date().toISOString()
  }));

  $("#scoreTitle").textContent = `Bạn đạt ${correct}/${total} câu`;
  $("#scoreSubtitle").textContent = `Điểm: ${percent}/100 • Thời gian: ${formatTime(state.elapsedSeconds)} • ${getResultMessage(percent)}`;
  renderReview();
  updateWrongSidebarButton();

  $("#quizPanel").classList.add("hidden");
  $("#resultPanel").classList.remove("hidden");
  updateStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getResultMessage(percent) {
  if (percent >= 90) return "Rất chắc bài.";
  if (percent >= 75) return "Ổn rồi, ôn thêm câu sai.";
  if (percent >= 50) return "Cần luyện thêm một lượt.";
  return "Nên xem lại đề cương từ đầu.";
}

function getDisplayedAnswerText(question, optionId) {
  if (!optionId) return "Chưa chọn";
  const option = (question.options || []).find(opt => opt.id === optionId);
  if (!option) return optionId;
  const displayLetter = question.displayLetterByOptionId?.[optionId] || optionId;
  return `${displayLetter}. ${option.text}`;
}

function renderReview() {
  const html = state.questions.map((question, index) => {
    const isCorrect = question.userAnswer === question.answer;
    const originalNumber = question.id || index + 1;
    return `
      <article class="review-card ${isCorrect ? "good" : "bad"}" id="review-question-${index}" data-review-status="${isCorrect ? "good" : "bad"}">
        <span class="review-status ${isCorrect ? "good" : "bad"}">${isCorrect ? "Đúng" : "Sai / Chưa chọn"}</span>
        <h4>Câu ${originalNumber}. ${escapeHtml(question.question)}</h4>
        <p><strong>Bạn chọn:</strong> ${escapeHtml(getDisplayedAnswerText(question, question.userAnswer))}</p>
        <p><strong>Đáp án đúng:</strong> ${escapeHtml(getDisplayedAnswerText(question, question.answer))}</p>
      </article>`;
  }).join("");
  $("#reviewList").innerHTML = html;
}

function retryQuiz() {
  // Làm lại cùng bộ câu hỏi nhưng vẫn đảo lại A/B/C/D để tránh học thuộc vị trí đáp án.
  state.questions = state.questions.map(q => normalizeQuizQuestion(q, true));
  state.submitted = false;
  updateWrongSidebarButton();
  renderQuiz();
  showQuiz();
  startTimer();
  updateStats();
}

function showWrongQuestions() {
  const wrongQuestions = getWrongQuestions();
  if (!state.submitted || !wrongQuestions.length) {
    alert("Hiện chưa có câu sai. Bạn cần nộp bài trước, nếu có câu sai thì phần này sẽ mở.");
    return;
  }

  $("#homePanel").classList.add("hidden");
  $("#quizPanel").classList.add("hidden");
  $("#bankPanel").classList.add("hidden");
  $("#statsPanel").classList.remove("hidden");
  $("#resultPanel").classList.remove("hidden");
  setSidebarActive("wrong");

  const firstWrong = document.querySelector('[data-review-status="bad"]');
  if (firstWrong) {
    firstWrong.scrollIntoView({ behavior: "smooth", block: "center" });
    firstWrong.classList.add("focus-wrong");
    window.setTimeout(() => firstWrong.classList.remove("focus-wrong"), 1800);
  }
}

function retryWrongQuestions() {
  const wrongQuestions = getWrongQuestions();
  if (!state.submitted || !wrongQuestions.length) {
    alert("Không có câu sai để làm lại.");
    return;
  }

  state.mode = "wrong";
  state.questions = wrongQuestions.map(q => normalizeQuizQuestion(q, true));
  state.submitted = false;
  state.elapsedSeconds = 0;
  updateWrongSidebarButton();
  renderQuiz();
  showQuiz();
  startTimer();
  updateStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function exitToHome() {
  const hasActiveQuiz = state.questions.length > 0 && !state.submitted && !$("#quizPanel").classList.contains("hidden");
  const ok = await showConfirmModal({
    title: hasActiveQuiz ? "Thoát bài đang làm?" : "Quay về trang chủ?",
    message: hasActiveQuiz
      ? "Bài hiện tại sẽ không được lưu. Bạn có chắc muốn thoát và quay về trang chủ không?"
      : "Bạn có muốn quay về trang chủ để chọn chế độ làm bài khác không?",
    confirmText: "Thoát về trang chủ",
    cancelText: "Ở lại"
  });

  if (!ok) return;

  stopTimer();
  state.questions = [];
  state.submitted = false;
  state.elapsedSeconds = 0;
  updateWrongSidebarButton();
  state.activeRange = getSelectedRange();
  state.activeOutlineRange = getSelectedOutlineRange();
  $("#timerText").textContent = "00:00";
  setMode("fixed");
  showHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderBank() {
  const keyword = ($("#searchInput")?.value || "").trim().toLowerCase();
  const bank = getBank().filter(question => {
    const haystack = [
      question.id,
      question.code,
      question.question,
      ...(question.options || []).map(o => o.text),
      question.answer
    ].join(" ").toLowerCase();
    return !keyword || haystack.includes(keyword);
  });

  $("#bankList").innerHTML = bank.map(question => `
    <article class="bank-item">
      <h4>Câu ${question.id}. ${escapeHtml(question.question)}</h4>
      <ul>
        ${(question.options || []).map(opt => `<li><strong>${escapeHtml(opt.id)}.</strong> ${escapeHtml(opt.text)}</li>`).join("")}
      </ul>
      <span class="bank-answer">Đáp án: ${escapeHtml(question.answer)}</span>
    </article>
  `).join("") || `<div class="bank-item"><h4>Không tìm thấy câu hỏi phù hợp.</h4></div>`;
}

function bindEvents() {
  const brandHomeBtn = $("#brandHomeBtn");
  if (brandHomeBtn) {
    brandHomeBtn.style.cursor = "pointer";
    brandHomeBtn.addEventListener("click", exitToHome);
    brandHomeBtn.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        exitToHome();
      }
    });
  }

  const homeSidebarBtn = $("#homeSidebarBtn");
  if (homeSidebarBtn) homeSidebarBtn.addEventListener("click", exitToHome);

  const wrongSidebarBtn = $("#wrongSidebarBtn");
  if (wrongSidebarBtn) wrongSidebarBtn.addEventListener("click", showWrongQuestions);

  $$('[data-mode-card]').forEach(card => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, label")) return;
      setMode(card.dataset.modeCard);
    });
  });

  $$('[data-start-mode]').forEach(button => {
    button.addEventListener("click", () => startQuiz(button.dataset.startMode));
  });

  $$('[data-start-random-repeat]').forEach(button => {
    button.addEventListener("click", () => startQuiz("random", { allowRepeat: true }));
  });

  $("#startMainBtn").addEventListener("click", () => startQuiz(state.mode));
  $("#submitBtn").addEventListener("click", submitQuiz);
  $("#newQuizBtn").addEventListener("click", () => startQuiz(state.mode));
  $("#retryBtn").addEventListener("click", retryQuiz);
  const wrongOnlyBtn = $("#wrongOnlyBtn");
  if (wrongOnlyBtn) wrongOnlyBtn.addEventListener("click", retryWrongQuestions);
  $("#nextBatchBtn").addEventListener("click", () => {
    if (state.mode === "random") startQuiz("random");
    else startQuiz("outline");
  });
  $("#backHomeBtn").addEventListener("click", showHome);
  $("#searchInput").addEventListener("input", renderBank);
  ["#rangeStart", "#rangeEnd"].forEach(selector => {
    const input = $(selector);
    if (input) input.addEventListener("change", syncRangeInputs);
  });
  ["#outlineRangeStart", "#outlineRangeEnd"].forEach(selector => {
    const input = $(selector);
    if (input) input.addEventListener("change", syncOutlineRangeInputs);
  });
  const resetRandomBtn = $("#resetRandomBtn");
  if (resetRandomBtn) resetRandomBtn.addEventListener("click", () => resetRandomProgress(false));

  $("#resetProgressBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    alert("Đã reset tiến độ.");
    updateStats();
  });
}

function init() {
  syncRangeInputs();
  syncOutlineRangeInputs();
  bindEvents();
  updateStats();
  updateWrongSidebarButton();
  setMode("fixed");
  setSidebarActive("home");
}

document.addEventListener("DOMContentLoaded", init);
