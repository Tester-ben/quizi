const OUTLINE_BATCH_SIZE = 20;
const RANDOM_BATCH_SIZE = 50;
const DEFAULT_RANGE_START = 1;
const DEFAULT_RANGE_END = 20;
const STORAGE_KEY = "quiz_outline_cursor_v1";
const HISTORY_KEY = "quiz_latest_result_v1";
const RANDOM_USED_KEY = "quiz_random_used_question_ids_v1";
const SAVED_QUESTIONS_KEY = "quiz_saved_question_ids_v1";
const DIFFICULT_QUESTIONS_KEY = "quiz_difficult_question_ids_v1";
const CUSTOM_LISTS_KEY = "quiz_custom_question_lists_v1";

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
  activeRandomRange: { start: DEFAULT_RANGE_START, end: 100 },
  randomAllowRepeat: false,
  activeCollectionId: null,
  collectionEditingId: null,
  pendingCollectionQuestionId: null
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
    title: "Random 50 câu",
    subtitle: "Chọn khoảng câu, sau đó random 50 câu không trùng hoặc cho phép trùng lặp giữa các lượt.",
    label: "Random"
  },
  wrong: {
    title: "Làm lại câu sai",
    subtitle: "Chỉ lấy các câu bạn làm sai hoặc chưa chọn ở bài vừa nộp để luyện lại.",
    label: "Câu sai"
  },
  saved: {
    title: "Làm lại câu đã lưu",
    subtitle: "Luyện riêng những câu bạn đã bấm lưu trước đó. Đáp án A/B/C/D vẫn được đảo ngẫu nhiên.",
    label: "Câu đã lưu"
  },
  difficult: {
    title: "Luyện tập câu khó",
    subtitle: "Luyện riêng những câu bạn đã đánh dấu là câu khó. Đáp án A/B/C/D vẫn được đảo ngẫu nhiên.",
    label: "Câu khó"
  },
  collection: {
    title: "Mục lưu riêng",
    subtitle: "Luyện riêng các câu đã được phân loại theo chủ đề bạn tự tạo.",
    label: "Mục riêng"
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

function getSavedQuestionIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_QUESTIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
}

function setSavedQuestionIds(ids) {
  const uniqueIds = Array.from(new Set(ids.map(String)));
  localStorage.setItem(SAVED_QUESTIONS_KEY, JSON.stringify(uniqueIds));
}

function isQuestionSaved(questionId) {
  return getSavedQuestionIds().includes(String(questionId));
}

function toggleSavedQuestion(questionId) {
  const id = String(questionId || "");
  if (!id) return;
  const savedIds = getSavedQuestionIds();
  const exists = savedIds.includes(id);
  const nextIds = exists ? savedIds.filter(savedId => savedId !== id) : [...savedIds, id];
  setSavedQuestionIds(nextIds);
  updateSavedButtons();
  updateSavedSidebarButton();
}

function getSavedQuestionsFromBank() {
  const bank = getBank();
  const savedIds = getSavedQuestionIds();
  return savedIds
    .map(id => bank.find(question => String(question.id) === String(id)))
    .filter(Boolean);
}

function updateSavedButtons() {
  $$('[data-save-question]').forEach(button => {
    const saved = isQuestionSaved(button.dataset.saveQuestion);
    button.classList.toggle('saved', saved);
    button.setAttribute('aria-pressed', saved ? 'true' : 'false');
    button.innerHTML = saved ? '<span>★</span> Đã lưu' : '<span>☆</span> Lưu câu';
  });
}

function updateSavedSidebarButton() {
  const savedBtn = $("#savedSidebarBtn");
  if (!savedBtn) return;
  const savedCount = getSavedQuestionIds().length;
  savedBtn.disabled = savedCount === 0;
  const strong = savedBtn.querySelector("strong");
  if (strong) strong.textContent = savedCount ? `Câu đã lưu (${savedCount})` : "Câu đã lưu";
}

function getDifficultQuestionIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIFFICULT_QUESTIONS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
}

function setDifficultQuestionIds(ids) {
  const uniqueIds = Array.from(new Set(ids.map(String)));
  localStorage.setItem(DIFFICULT_QUESTIONS_KEY, JSON.stringify(uniqueIds));
}

function isQuestionDifficult(questionId) {
  return getDifficultQuestionIds().includes(String(questionId));
}

function toggleDifficultQuestion(questionId) {
  const id = String(questionId || "");
  if (!id) return;
  const difficultIds = getDifficultQuestionIds();
  const exists = difficultIds.includes(id);
  const nextIds = exists ? difficultIds.filter(itemId => itemId !== id) : [...difficultIds, id];
  setDifficultQuestionIds(nextIds);
  updateDifficultButtons();
  updateDifficultSidebarButton();
}

function getDifficultQuestionsFromBank() {
  const bank = getBank();
  const difficultIds = getDifficultQuestionIds();
  return difficultIds
    .map(id => bank.find(question => String(question.id) === String(id)))
    .filter(Boolean);
}

function updateDifficultButtons() {
  $$('[data-difficult-question]').forEach(button => {
    const difficult = isQuestionDifficult(button.dataset.difficultQuestion);
    button.classList.toggle('marked-difficult', difficult);
    button.setAttribute('aria-pressed', difficult ? 'true' : 'false');
    button.innerHTML = difficult ? '<span>◆</span> Đã đánh dấu khó' : '<span>◇</span> Câu khó';
  });
}

function updateDifficultSidebarButton() {
  const difficultBtn = $("#difficultSidebarBtn");
  if (!difficultBtn) return;
  const difficultCount = getDifficultQuestionIds().length;
  difficultBtn.disabled = difficultCount === 0;
  const strong = difficultBtn.querySelector("strong");
  if (strong) strong.textContent = difficultCount ? `Câu khó (${difficultCount})` : "Câu khó";
}


function getCustomLists() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_LISTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(item => ({
      id: String(item.id || ""),
      name: String(item.name || "Mục chưa đặt tên"),
      questionIds: Array.isArray(item.questionIds) ? Array.from(new Set(item.questionIds.map(String))) : []
    })).filter(item => item.id) : [];
  } catch (error) {
    return [];
  }
}

function setCustomLists(lists) {
  localStorage.setItem(CUSTOM_LISTS_KEY, JSON.stringify(lists));
}

function createCustomList(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const lists = getCustomLists();
  const list = { id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: cleanName, questionIds: [] };
  lists.push(list);
  setCustomLists(lists);
  renderCustomListNav();
  return list;
}

function renameCustomList(listId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  const lists = getCustomLists().map(list => list.id === listId ? { ...list, name: cleanName } : list);
  setCustomLists(lists);
  renderCustomListNav();
}

async function deleteCustomList(listId) {
  const list = getCustomLists().find(item => item.id === listId);
  if (!list) return;
  const ok = await showConfirmModal({
    title: `Xóa mục “${list.name}”?`,
    message: "Các câu hỏi không bị xóa khỏi đề, chỉ xóa mục phân loại này.",
    confirmText: "Xóa mục",
    cancelText: "Giữ lại"
  });
  if (!ok) return;
  setCustomLists(getCustomLists().filter(item => item.id !== listId));
  if (state.activeCollectionId === listId) showHome();
  renderCustomListNav();
}

function getCollectionQuestions(listId) {
  const list = getCustomLists().find(item => item.id === listId);
  if (!list) return [];
  const bank = getBank();
  return list.questionIds.map(id => bank.find(question => String(question.id) === id)).filter(Boolean);
}

function openCustomListEditor(listId = null) {
  const modal = $("#customListModal");
  const input = $("#customListNameInput");
  const title = $("#customListModalTitle");
  const text = $("#customListModalText");
  if (!modal || !input || !title || !text) return;
  state.collectionEditingId = listId;
  const list = listId ? getCustomLists().find(item => item.id === listId) : null;
  title.textContent = list ? "Đổi tên mục lưu" : "Tạo mục lưu mới";
  text.textContent = list ? "Nhập tên mới cho mục lưu này." : "Đặt tên để gom các câu cùng chủ đề.";
  input.value = list?.name || "";
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => input.focus(), 30);
}

function closeCustomListEditor() {
  const modal = $("#customListModal");
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  state.collectionEditingId = null;
  document.body.classList.remove("modal-open");
}

function saveCustomListEditor() {
  const input = $("#customListNameInput");
  const name = input?.value.trim();
  if (!name) {
    alert("Bạn hãy nhập tên mục lưu.");
    input?.focus();
    return;
  }
  if (state.collectionEditingId) renameCustomList(state.collectionEditingId, name);
  else createCustomList(name);
  closeCustomListEditor();
  if (state.pendingCollectionQuestionId) openQuestionListModal(state.pendingCollectionQuestionId);
}

function renderCustomListNav() {
  const container = $("#customListNav");
  if (!container) return;
  const lists = getCustomLists();
  container.innerHTML = lists.map((list, index) => `
    <div class="custom-list-row ${state.activeCollectionId === list.id ? "active" : ""}">
      <button class="custom-list-open" type="button" data-open-custom-list="${escapeHtml(list.id)}">
        <span>${String(index + 5).padStart(2, "0")}</span>
        <strong>${escapeHtml(list.name)}${list.questionIds.length ? ` (${list.questionIds.length})` : ""}</strong>
      </button>
      <button class="custom-list-menu" type="button" data-custom-list-menu="${escapeHtml(list.id)}" title="Tùy chọn">•••</button>
      <div class="custom-list-popover" data-custom-list-popover="${escapeHtml(list.id)}">
        <button type="button" data-rename-custom-list="${escapeHtml(list.id)}">Đổi tên</button>
        <button type="button" data-delete-custom-list="${escapeHtml(list.id)}">Xóa mục</button>
      </div>
    </div>`).join("");

  $$('[data-open-custom-list]').forEach(button => button.addEventListener("click", () => startCustomList(button.dataset.openCustomList)));
  $$('[data-custom-list-menu]').forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const id = button.dataset.customListMenu;
    $$('[data-custom-list-popover]').forEach(pop => pop.classList.toggle("show", pop.dataset.customListPopover === id && !pop.classList.contains("show")));
  }));
  $$('[data-rename-custom-list]').forEach(button => button.addEventListener("click", () => openCustomListEditor(button.dataset.renameCustomList)));
  $$('[data-delete-custom-list]').forEach(button => button.addEventListener("click", () => deleteCustomList(button.dataset.deleteCustomList)));
}

function openQuestionListModal(questionId) {
  const lists = getCustomLists();
  if (!lists.length) {
    state.pendingCollectionQuestionId = String(questionId);
    openCustomListEditor();
    return;
  }
  state.pendingCollectionQuestionId = String(questionId);
  const modal = $("#questionListModal");
  const options = $("#questionListOptions");
  options.innerHTML = lists.map(list => `
    <label class="question-list-option">
      <input type="checkbox" value="${escapeHtml(list.id)}" ${list.questionIds.includes(String(questionId)) ? "checked" : ""} />
      <span><strong>${escapeHtml(list.name)}</strong><small>${list.questionIds.length} câu</small></span>
    </label>`).join("");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeQuestionListModal() {
  const modal = $("#questionListModal");
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  state.pendingCollectionQuestionId = null;
  document.body.classList.remove("modal-open");
}

function saveQuestionListMembership() {
  const questionId = String(state.pendingCollectionQuestionId || "");
  if (!questionId) return closeQuestionListModal();
  const selected = new Set($$("#questionListOptions input:checked").map(input => input.value));
  const lists = getCustomLists().map(list => {
    const ids = new Set(list.questionIds);
    selected.has(list.id) ? ids.add(questionId) : ids.delete(questionId);
    return { ...list, questionIds: Array.from(ids) };
  });
  setCustomLists(lists);
  closeQuestionListModal();
  renderCustomListNav();
  updateCollectionButtons();
}

function isQuestionInAnyCustomList(questionId) {
  return getCustomLists().some(list => list.questionIds.includes(String(questionId)));
}

function updateCollectionButtons() {
  $$('[data-add-to-list]').forEach(button => {
    const added = isQuestionInAnyCustomList(button.dataset.addToList);
    button.classList.toggle("added-to-list", added);
    button.innerHTML = added ? '<span>▣</span> Đã phân loại' : '<span>＋</span> Thêm vào mục';
  });
}

function startCustomList(listId) {
  const list = getCustomLists().find(item => item.id === listId);
  if (!list || !list.questionIds.length) {
    alert("Mục này chưa có câu hỏi. Hãy bấm “Thêm vào mục” ở một câu hỏi trước.");
    return;
  }
  state.activeCollectionId = listId;
  state.mode = "collection";
  modeConfig.collection.title = list.name;
  modeConfig.collection.subtitle = `Luyện riêng ${list.questionIds.length} câu trong mục “${list.name}”.`;
  modeConfig.collection.label = list.name;
  startQuiz("collection");
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
  const savedBtn = $("#savedSidebarBtn");
  const difficultBtn = $("#difficultSidebarBtn");
  if (activeKey !== "collection") state.activeCollectionId = null;
  if (homeBtn) homeBtn.classList.toggle("active", activeKey === "home");
  if (wrongBtn) wrongBtn.classList.toggle("active", activeKey === "wrong");
  if (savedBtn) savedBtn.classList.toggle("active", activeKey === "saved");
  if (difficultBtn) difficultBtn.classList.toggle("active", activeKey === "difficult");
  renderCustomListNav();
}

function updateWrongSidebarButton() {
  const wrongBtn = $("#wrongSidebarBtn");
  if (!wrongBtn) return;
  const wrongCount = state.submitted ? getWrongQuestions().length : 0;
  wrongBtn.disabled = wrongCount === 0;
  const strong = wrongBtn.querySelector("strong");
  if (strong) strong.textContent = wrongCount ? `Câu làm sai (${wrongCount})` : "Câu làm sai";
}

function getQuestionDisplayNumber(question, index) {
  return question?.id || index + 1;
}

function hideQuestionNavigator() {
  const card = $("#questionMapCard");
  const grid = $("#questionMapGrid");
  if (card) card.classList.add("hidden");
  if (grid) grid.innerHTML = "";
}

function jumpToQuestion(index) {
  const target = state.submitted
    ? document.getElementById(`review-question-${index}`)
    : document.getElementById(`question-${index}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("jump-focus");
  window.setTimeout(() => target.classList.remove("jump-focus"), 1400);
}

function renderQuestionNavigator() {
  const card = $("#questionMapCard");
  const grid = $("#questionMapGrid");
  const count = $("#questionMapCount");
  if (!card || !grid || !count) return;

  if (!state.questions.length) {
    hideQuestionNavigator();
    return;
  }

  const answered = state.questions.filter(question => question.userAnswer).length;
  count.textContent = `${answered}/${state.questions.length} câu`;
  card.classList.remove("hidden");

  grid.innerHTML = state.questions.map((question, index) => {
    const answeredClass = question.userAnswer ? "answered" : "pending";
    let resultClass = "";
    if (state.submitted) {
      resultClass = question.userAnswer === question.answer ? " correct" : " wrong";
    }
    return `<button class="question-map-btn ${answeredClass}${resultClass}" type="button" data-question-jump="${index}" aria-label="Nhảy tới câu ${escapeHtml(getQuestionDisplayNumber(question, index))}">${escapeHtml(getQuestionDisplayNumber(question, index))}</button>`;
  }).join("");

  $$('[data-question-jump]').forEach(button => {
    button.addEventListener("click", () => jumpToQuestion(Number(button.dataset.questionJump)));
  });
}

function getQuestionKey(question) {
  return String(question?.id ?? question?.code ?? question?.question ?? "");
}

function getRandomQuestionsWithoutRepeat() {
  const bank = getBank();
  if (!bank.length) return [];

  const range = getSelectedRandomRange();
  state.activeRandomRange = range;
  const rangeBank = bank.slice(range.start - 1, range.end);

  if (rangeBank.length < RANDOM_BATCH_SIZE) {
    alert(`Khoảng câu ${range.start}–${range.end} chỉ có ${rangeBank.length} câu. Vui lòng chọn khoảng có ít nhất ${RANDOM_BATCH_SIZE} câu.`);
    return null;
  }

  let usedIds = getRandomUsedIds();
  let available = rangeBank.filter(question => !usedIds.has(getQuestionKey(question)));

  if (!available.length) {
    const shouldReset = confirm("Bạn đã làm hết các câu trong khoảng đã chọn. Bạn muốn reset random để làm lại từ đầu không?");
    if (!shouldReset) return null;
    resetRandomProgress(true);
    usedIds = getRandomUsedIds();
    available = [...rangeBank];
  }

  if (available.length < RANDOM_BATCH_SIZE) {
    const shouldContinue = confirm(`Trong khoảng đã chọn chỉ còn ${available.length} câu chưa làm. Bạn có muốn làm phần câu còn lại không?`);
    if (!shouldContinue) return null;
  }

  const selected = shuffleArray(available).slice(0, Math.min(RANDOM_BATCH_SIZE, available.length));
  selected.forEach(question => usedIds.add(getQuestionKey(question)));
  setRandomUsedIds(usedIds);
  return selected.map(question => normalizeQuizQuestion(question, true));
}

function getRandomQuestionsWithRepeat() {
  const bank = getBank();
  const range = getSelectedRandomRange();
  state.activeRandomRange = range;
  const rangeBank = bank.slice(range.start - 1, range.end);

  if (rangeBank.length < RANDOM_BATCH_SIZE) {
    alert(`Khoảng câu ${range.start}–${range.end} chỉ có ${rangeBank.length} câu. Vui lòng chọn khoảng có ít nhất ${RANDOM_BATCH_SIZE} câu.`);
    return null;
  }

  return shuffleArray(rangeBank).slice(0, RANDOM_BATCH_SIZE).map(question => normalizeQuizQuestion(question, true));
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

function getSelectedRandomRange() {
  const bank = getBank();
  const total = bank.length || 100;
  let start = clampNumber($("#randomRangeStart")?.value || DEFAULT_RANGE_START, 1, total);
  let end = clampNumber($("#randomRangeEnd")?.value || Math.min(100, total), 1, total);
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

function syncRandomRangeInputs() {
  const bank = getBank();
  const total = bank.length || 100;
  const startInput = $("#randomRangeStart");
  const endInput = $("#randomRangeEnd");
  if (!startInput || !endInput) return;
  startInput.max = String(total);
  endInput.max = String(total);
  if (!startInput.value) startInput.value = String(DEFAULT_RANGE_START);
  if (!endInput.value) endInput.value = String(Math.min(100, total));
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

  if (mode === "saved") {
    return getSavedQuestionsFromBank().map(q => normalizeQuizQuestion(q, true));
  }

  if (mode === "difficult") {
    return shuffleArray(getDifficultQuestionsFromBank()).map(q => normalizeQuizQuestion(q, true));
  }

  if (mode === "collection") {
    return shuffleArray(getCollectionQuestions(state.activeCollectionId)).map(q => normalizeQuizQuestion(q, true));
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
  updateSavedSidebarButton();
  updateDifficultSidebarButton();

  if (mode === "bank") {
    showBank();
  }
}

function showHome() {
  stopTimer();
  hideQuestionNavigator();
  setSidebarActive("home");
  $("#homePanel").classList.remove("hidden");
  $("#quizPanel").classList.add("hidden");
  $("#resultPanel").classList.add("hidden");
  $("#bankPanel").classList.add("hidden");
  $("#statsPanel").classList.remove("hidden");
  updateStats();
  updateSavedSidebarButton();
}

function showQuiz() {
  setSidebarActive(state.mode === "saved" ? "saved" : (state.mode === "difficult" ? "difficult" : (state.mode === "collection" ? "collection" : null)));
  renderQuestionNavigator();
  $("#homePanel").classList.add("hidden");
  $("#bankPanel").classList.add("hidden");
  $("#resultPanel").classList.add("hidden");
  $("#quizPanel").classList.remove("hidden");
  $("#statsPanel").classList.remove("hidden");
}

function showBank() {
  stopTimer();
  hideQuestionNavigator();
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
    meta += ` • Câu ${state.activeRandomRange.start}–${state.activeRandomRange.end}`;
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
          <div class="question-action-buttons">
            <button class="save-question-btn" type="button" data-save-question="${escapeHtml(question.id)}" aria-pressed="false">
              <span>☆</span> Lưu câu
            </button>
            <button class="difficult-question-btn" type="button" data-difficult-question="${escapeHtml(question.id)}" aria-pressed="false">
              <span>◇</span> Câu khó
            </button>
            <button class="collection-question-btn" type="button" data-add-to-list="${escapeHtml(question.id)}">
              <span>＋</span> Thêm vào mục
            </button>
          </div>
        </div>
        <div class="option-list">${optionsHtml}</div>
      </article>`;
  }).join("");

  $("#quizForm").innerHTML = html;

  $$("#quizForm input[type='radio']").forEach(input => {
    input.addEventListener("change", handleAnswerChange);
  });
  $$("#quizForm [data-save-question]").forEach(button => {
    button.addEventListener("click", () => toggleSavedQuestion(button.dataset.saveQuestion));
  });
  $$("#quizForm [data-difficult-question]").forEach(button => {
    button.addEventListener("click", () => toggleDifficultQuestion(button.dataset.difficultQuestion));
  });
  $$("#quizForm [data-add-to-list]").forEach(button => {
    button.addEventListener("click", () => openQuestionListModal(button.dataset.addToList));
  });
  updateSavedButtons();
  updateDifficultButtons();
  updateCollectionButtons();
  renderQuestionNavigator();
}

function handleAnswerChange(event) {
  const name = event.target.name;
  const index = Number(name.replace("question-", ""));
  if (state.questions[index]) {
    state.questions[index].userAnswer = event.target.value;
  }
  updateStats();
  renderQuestionNavigator();
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
  updateSavedSidebarButton();
  updateDifficultSidebarButton();
  renderQuestionNavigator();

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
    const reviewOptionsHtml = question.displayOptions.map((option, optionIndex) => {
      const displayLetter = String.fromCharCode(65 + optionIndex);
      const isSelected = option.id === question.userAnswer;
      const isAnswer = option.id === question.answer;
      const optionClasses = ["review-option"];
      if (isAnswer) optionClasses.push("correct");
      if (isSelected && !isAnswer) optionClasses.push("wrong");
      if (isSelected) optionClasses.push("selected");

      let marker = "";
      if (isAnswer && isSelected) marker = '<span class="review-option-note">Bạn chọn • Đáp án đúng</span>';
      else if (isAnswer) marker = '<span class="review-option-note">Đáp án đúng</span>';
      else if (isSelected) marker = '<span class="review-option-note">Bạn chọn</span>';

      return `
        <div class="${optionClasses.join(" ")}">
          <span class="option-letter">${displayLetter}</span>
          <span class="review-option-text">${escapeHtml(option.text)}</span>
          ${marker}
        </div>`;
    }).join("");

    return `
      <article class="review-card ${isCorrect ? "good" : "bad"}" id="review-question-${index}" data-review-status="${isCorrect ? "good" : "bad"}">
        <div class="review-topline">
          <span class="review-status ${isCorrect ? "good" : "bad"}">${isCorrect ? "Đúng" : "Sai / Chưa chọn"}</span>
          <div class="question-action-buttons compact-actions">
            <button class="save-question-btn compact" type="button" data-save-question="${escapeHtml(question.id)}" aria-pressed="false">
              <span>☆</span> Lưu câu
            </button>
            <button class="difficult-question-btn compact" type="button" data-difficult-question="${escapeHtml(question.id)}" aria-pressed="false">
              <span>◇</span> Câu khó
            </button>
            <button class="collection-question-btn compact" type="button" data-add-to-list="${escapeHtml(question.id)}">
              <span>＋</span> Thêm vào mục
            </button>
          </div>
        </div>
        <h4>Câu ${originalNumber}. ${escapeHtml(question.question)}</h4>
        <p><strong>Bạn chọn:</strong> ${escapeHtml(getDisplayedAnswerText(question, question.userAnswer))}</p>
        <p><strong>Đáp án đúng:</strong> ${escapeHtml(getDisplayedAnswerText(question, question.answer))}</p>
        <div class="review-option-list">${reviewOptionsHtml}</div>
      </article>`;
  }).join("");
  $("#reviewList").innerHTML = html;
  $$("#reviewList [data-save-question]").forEach(button => {
    button.addEventListener("click", () => toggleSavedQuestion(button.dataset.saveQuestion));
  });
  $$("#reviewList [data-difficult-question]").forEach(button => {
    button.addEventListener("click", () => toggleDifficultQuestion(button.dataset.difficultQuestion));
  });
  $$("#reviewList [data-add-to-list]").forEach(button => {
    button.addEventListener("click", () => openQuestionListModal(button.dataset.addToList));
  });
  updateSavedButtons();
  updateDifficultButtons();
  updateCollectionButtons();
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
  hideQuestionNavigator();
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

function startSavedQuestions() {
  const savedQuestions = getSavedQuestionsFromBank();
  if (!savedQuestions.length) {
    alert("Bạn chưa lưu câu hỏi nào. Bấm nút 'Lưu câu' ở câu muốn ôn lại trước nha.");
    updateSavedSidebarButton();
    return;
  }

  setSidebarActive("saved");
  startQuiz("saved");
}

function startDifficultQuestions() {
  const difficultQuestions = getDifficultQuestionsFromBank();
  if (!difficultQuestions.length) {
    alert("Bạn chưa đánh dấu câu khó nào. Bấm nút 'Câu khó' bên cạnh nút 'Lưu câu' trước nha.");
    updateDifficultSidebarButton();
    return;
  }

  setSidebarActive("difficult");
  startQuiz("difficult");
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
      <div class="bank-topline">
        <h4>Câu ${question.id}. ${escapeHtml(question.question)}</h4>
        <button class="save-question-btn compact" type="button" data-save-question="${escapeHtml(question.id)}" aria-pressed="false">
          <span>☆</span> Lưu câu
        </button>
      </div>
      <ul>
        ${(question.options || []).map(opt => `<li><strong>${escapeHtml(opt.id)}.</strong> ${escapeHtml(opt.text)}</li>`).join("")}
      </ul>
      <span class="bank-answer">Đáp án: ${escapeHtml(question.answer)}</span>
    </article>
  `).join("") || `<div class="bank-item"><h4>Không tìm thấy câu hỏi phù hợp.</h4></div>`;
  $$("#bankList [data-save-question]").forEach(button => {
    button.addEventListener("click", () => toggleSavedQuestion(button.dataset.saveQuestion));
  });
  $$("#bankList [data-difficult-question]").forEach(button => {
    button.addEventListener("click", () => toggleDifficultQuestion(button.dataset.difficultQuestion));
  });
  updateSavedButtons();
  updateDifficultButtons();
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

  const savedSidebarBtn = $("#savedSidebarBtn");
  if (savedSidebarBtn) savedSidebarBtn.addEventListener("click", startSavedQuestions);

  const difficultSidebarBtn = $("#difficultSidebarBtn");
  if (difficultSidebarBtn) difficultSidebarBtn.addEventListener("click", startDifficultQuestions);

  $("#addCustomListBtn")?.addEventListener("click", () => openCustomListEditor());
  $("#customListModalClose")?.addEventListener("click", closeCustomListEditor);
  $("#customListModalCancel")?.addEventListener("click", closeCustomListEditor);
  $("#customListModalSave")?.addEventListener("click", saveCustomListEditor);
  $("#customListNameInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") saveCustomListEditor();
  });
  $("#questionListModalClose")?.addEventListener("click", closeQuestionListModal);
  $("#questionListModalCancel")?.addEventListener("click", closeQuestionListModal);
  $("#questionListModalSave")?.addEventListener("click", saveQuestionListMembership);
  $("#createListInsideModalBtn")?.addEventListener("click", () => {
    $("#questionListModal")?.classList.remove("show");
    openCustomListEditor();
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".custom-list-row")) $$('[data-custom-list-popover]').forEach(pop => pop.classList.remove("show"));
  });

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
  const bottomSubmitBtn = $("#bottomSubmitBtn");
  if (bottomSubmitBtn) bottomSubmitBtn.addEventListener("click", submitQuiz);
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
  ["#randomRangeStart", "#randomRangeEnd"].forEach(selector => {
    const input = $(selector);
    if (input) input.addEventListener("change", syncRandomRangeInputs);
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
  syncRandomRangeInputs();
  bindEvents();
  updateStats();
  updateWrongSidebarButton();
  updateSavedSidebarButton();
  updateDifficultSidebarButton();
  renderCustomListNav();
  setMode("fixed");
  setSidebarActive("home");
}

document.addEventListener("DOMContentLoaded", init);
