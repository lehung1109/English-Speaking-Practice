let lessons = {};
let config = {};
let settings = {};

let currentLesson = null;
let currentQuestionIndex = 0;
let timer = null;
let timeRemaining = 50;
let isPaused = false;
let isRunning = false;
let synth = globalThis.speechSynthesis;
let voices = [];
let sortedVoices = [];
let currentUtterance = null;
let currentLanguage = "en"; // "en" | "vi"

// Elements
const lessonSelector = document.getElementById("lessonSelector");
const practiceArea = document.querySelector(".practice-area");
const questionNumber = document.getElementById("questionNumber");
const questionText = document.getElementById("questionText");
const timerValue = document.getElementById("timerValue");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const statusIndicator = document.getElementById("statusIndicator");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const completionMessage = document.getElementById("completionMessage");
const restartBtn = document.getElementById("restartBtn");
const languageSelect = document.getElementById("languageSelect");
const voiceSelect = document.getElementById("voiceSelect");
const voiceSelectLabel = document.getElementById("voiceSelectLabel");
const speedControl = document.getElementById("speedControl");
const speedValue = document.getElementById("speedValue");
const navigationControls = document.getElementById("navigationControls");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const replayBtn = document.getElementById("replayBtn");
const answerSection = document.getElementById("answerSection");
const answerInput = document.getElementById("answerInput");
const saveAnswerBtn = document.getElementById("saveAnswerBtn");
const completedSection = document.getElementById("completedSection");
const completedList = document.getElementById("completedList");

const ANSWERS_STORAGE_KEY = "esp_answers_v1";
let answersByKey = {};

function loadSavedAnswers() {
  try {
    const raw = localStorage.getItem(ANSWERS_STORAGE_KEY);
    answersByKey = raw ? JSON.parse(raw) : {};
  } catch {
    answersByKey = {};
  }
}

function persistAnswers() {
  try {
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answersByKey));
  } catch {
    // ignore storage quota / privacy mode issues
  }
}

function getLessonKey() {
  const lessonNum =
    currentLesson && typeof currentLesson === "object"
      ? Object.keys(lessons).find((k) => lessons[k] === currentLesson)
      : null;
  return lessonNum ? `${currentLanguage}|${lessonNum}` : `${currentLanguage}|unknown`;
}

function getQuestionKey(index) {
  return `${getLessonKey()}|q${index}`;
}

function getSavedAnswer(index) {
  return answersByKey[getQuestionKey(index)] || "";
}

function setSavedAnswer(index, answer) {
  answersByKey[getQuestionKey(index)] = answer;
  persistAnswers();
}

function clearAnswersForCurrentLesson() {
  const prefix = `${getLessonKey()}|q`;
  let changed = false;
  Object.keys(answersByKey).forEach((k) => {
    if (k.startsWith(prefix)) {
      delete answersByKey[k];
      changed = true;
    }
  });
  if (changed) persistAnswers();
}

function renderCompletedList() {
  if (!completedSection || !completedList || !currentLesson) return;

  const questions = getCurrentQuestions();
  const items = [];
  for (let i = 0; i < questions.length; i++) {
    const a = getSavedAnswer(i).trim();
    if (!a) continue;
    items.push({ index: i, question: questions[i], answer: a });
  }

  // Only show when there is at least one saved answer.
  if (!items.length) {
    completedSection.style.display = "none";
    completedList.innerHTML = "";
    return;
  }

  completedSection.style.display = "block";
  completedList.innerHTML = items
    .map(
      (it) => `
        <div class="completed-item">
          <div class="completed-q">${it.index + 1}. ${escapeHtml(it.question)}</div>
          <div class="completed-a">${escapeHtml(it.answer)}</div>
        </div>
      `
    )
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentQuestions() {
  if (!currentLesson) {
    return [];
  }
  if (currentLanguage === "vi") {
    return currentLesson.questions_vi || [];
  }
  return currentLesson.questions || [];
}

function updateVoiceLabel() {
  if (!voiceSelectLabel) {
    return;
  }
  if (currentLanguage === "vi") {
    voiceSelectLabel.textContent = "🔊 Chọn giọng đọc (Ưu tiên giọng Việt 🇻🇳):";
  } else {
    voiceSelectLabel.textContent = "🔊 Chọn giọng đọc (Ưu tiên giọng Mỹ 🇺🇸):";
  }
}

// Load config from JSON file
async function loadConfig() {
  try {
    const response = await fetch("./config.json");
    if (!response.ok) {
      throw new Error("Failed to load config.json");
    }
    config = await response.json();
    lessons = config.lessons;
    settings = config.settings || {
      timerDuration: 50,
      defaultLanguage: "en",
      defaultSpeed: 1.0,
      minSpeed: 0.5,
      maxSpeed: 2.0,
      speedStep: 0.1,
    };

    // Initialize default language from config
    currentLanguage = settings.defaultLanguage === "vi" ? "vi" : "en";
    if (languageSelect) {
      languageSelect.value = currentLanguage;
    }

    // Initialize timer duration
    timeRemaining = settings.timerDuration;
    timerValue.textContent = timeRemaining.toString();

    // Initialize speed control from config
    speedControl.min = settings.minSpeed;
    speedControl.max = settings.maxSpeed;
    speedControl.step = settings.speedStep;
    speedControl.value = settings.defaultSpeed;
    speedValue.textContent = settings.defaultSpeed + "x";

    // Render lesson buttons dynamically
    renderLessonButtons();

    // Initialize voices based on selected language
    updateVoiceLabel();
    loadVoices();

    loadSavedAnswers();

    console.log("Config loaded successfully");
  } catch (error) {
    console.error("Error loading config:", error);
    alert("Không thể tải cấu hình. Vui lòng kiểm tra file config.json");
  }
}

// Render lesson buttons from config
function renderLessonButtons() {
  if (!lessons || !lessonSelector) {
    return;
  }

  lessonSelector.innerHTML = "";

  // Get lesson numbers and sort them
  const lessonNumbers = Object.keys(lessons).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  );

  lessonNumbers.forEach((lessonNum) => {
    const lesson = lessons[lessonNum];
    const questionsForLang =
      currentLanguage === "vi" ? lesson.questions_vi : lesson.questions;
    const questionCount = questionsForLang ? questionsForLang.length : 0;

    // Only show lessons that have questions for the current language
    if (questionCount === 0) {
      return;
    }
    
    const button = document.createElement("button");
    button.className = "lesson-btn";
    button.dataset.lesson = lessonNum;
    
    // Add emoji based on lesson number (or you can add emoji field to config.json later)
    const emojis = ["📝", "💼", "👨‍👩‍👧‍👦", "🎓", "🏠", "🍔", "🎮", "✈️"];
    const emoji = emojis[Number.parseInt(lessonNum, 10) - 1] || "📚";
    
    button.innerHTML = `${emoji} BÀI ${lessonNum}: ${lesson.title}<br /><small>(${questionCount} câu hỏi)</small>`;
    
    lessonSelector.appendChild(button);
  });
}

// Load config on page load
loadConfig();

// Load and prioritize voices
function loadVoices() {
  voices = synth.getVoices();

  if (currentLanguage === "vi") {
    // Filter Vietnamese voices and categorize by priority
    const vnVoices = [];
    const otherViVoices = [];

    voices.forEach((voice) => {
      if (voice.lang.startsWith("vi-VN")) {
        vnVoices.push(voice);
      } else if (voice.lang.startsWith("vi")) {
        otherViVoices.push(voice);
      }
    });

    const viPriorityScore = (voice) => {
      const name = (voice.name || "").toLowerCase();
      // Windows Vietnamese voices commonly include "HoaiMy" (female) and "NamMinh" (male)
      if (name.includes("hoaimy")) return 0;
      if (name.includes("female") || name.includes("nữ") || name.includes("nu")) return 1;
      if (name.includes("namminh") || name.includes("male") || name.includes("nam")) return 3;
      return 2;
    };

    // Combine in priority order: vi-VN -> other vi*, then sort to put female voices first
    sortedVoices = [...vnVoices, ...otherViVoices].sort(
      (a, b) => viPriorityScore(a) - viPriorityScore(b)
    );
  } else {
    // Filter English voices and categorize by priority
    const usVoices = [];
    const ukVoices = [];
    const otherEnVoices = [];

    voices.forEach((voice) => {
      if (voice.lang.startsWith("en-US")) {
        usVoices.push(voice);
      } else if (voice.lang.startsWith("en-GB")) {
        ukVoices.push(voice);
      } else if (voice.lang.startsWith("en")) {
        otherEnVoices.push(voice);
      }
    });

    // Combine in priority order: US -> UK -> Other
    sortedVoices = [...usVoices, ...ukVoices, ...otherEnVoices];
  }

  // Populate select dropdown
  voiceSelect.innerHTML = "";

  if (sortedVoices.length === 0) {
    voiceSelect.innerHTML = `<option>${
      currentLanguage === "vi"
        ? "Không có giọng Tiếng Việt khả dụng"
        : "No English voices available"
    }</option>`;
  } else {
    sortedVoices.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = index;

      // Add badge based on voice type
      let badge = "";
      if (currentLanguage === "vi") {
        if (voice.lang.startsWith("vi-VN")) {
          badge = " 🇻🇳 [Recommended]";
        }
      } else {
        if (voice.lang.startsWith("en-US")) badge = " 🇺🇸 [Recommended]";
        else if (voice.lang.startsWith("en-GB")) badge = " 🇬🇧";
      }

      option.textContent = `${voice.name} (${voice.lang})${badge}`;

      // Auto-select first prioritized voice (index 0 if available)
      if (index === 0) {
        option.selected = true;
      }

      voiceSelect.appendChild(option);
    });
  }
}

// Load voices when available
if (synth.onvoiceschanged !== undefined) {
  synth.onvoiceschanged = loadVoices;
}

// Initial load
setTimeout(loadVoices, 100);
updateVoiceLabel();

languageSelect?.addEventListener("change", (e) => {
  const nextLang = e.target.value === "vi" ? "vi" : "en";
  currentLanguage = nextLang;

  updateVoiceLabel();
  loadVoices();
  renderLessonButtons();

  // If a lesson is selected, reset the practice UI so questions match the language
  if (currentLesson) {
    resetPractice();
    updateProgress();
  }
});

speedControl.addEventListener("input", (e) => {
  speedValue.textContent = e.target.value + "x";
});

// Lesson selection - using event delegation for dynamically created buttons
lessonSelector.addEventListener("click", (e) => {
  const btn = e.target.closest(".lesson-btn");
  if (btn) {
    const lessonNum = Number.parseInt(btn.dataset.lesson, 10);
    selectLesson(lessonNum);
  }
});

function selectLesson(lessonNum) {
  if (!lessons || !lessons[lessonNum]) {
    alert("Cấu hình chưa được tải. Vui lòng đợi...");
    return;
  }
  currentLesson = lessons[lessonNum];
  currentQuestionIndex = 0;

  // Update active state for lesson buttons
  const lessonBtns = document.querySelectorAll(".lesson-btn");
  lessonBtns.forEach((btn) => {
    btn.classList.toggle(
      "active",
      Number.parseInt(btn.dataset.lesson, 10) === lessonNum
    );
  });

  practiceArea.classList.add("active");
  resetPractice();
  updateProgress();
}

function resetPractice() {
  stopTimer();
  synth.cancel();
  isRunning = false;
  isPaused = false;
  timeRemaining = settings.timerDuration || 50;
  currentQuestionIndex = 0;

  questionText.textContent = "Nhấn Start để bắt đầu";
  questionNumber.textContent = "";
  timerValue.textContent = timeRemaining.toString();
  timerValue.classList.remove("warning");
  statusIndicator.style.display = "none";
  completionMessage.style.display = "none";
  navigationControls.style.display = "none";
  if (answerSection) answerSection.style.display = "none";
  if (answerInput) answerInput.value = "";
  if (completedSection) completedSection.style.display = "none";
  if (completedList) completedList.innerHTML = "";
  
  if (replayBtn) {
    replayBtn.style.display = "none";
  }

  // Show Start button, hide Pause and Stop buttons
  startBtn.style.display = "block";
  pauseBtn.style.display = "none";
  stopBtn.style.display = "none";
  startBtn.disabled = false;
  prevBtn.disabled = true;
  nextBtn.disabled = true;

  updateProgress();
}

function updateProgress() {
  const questions = getCurrentQuestions();
  if (!questions.length) {
    return;
  }
  const total = questions.length;
  const current = currentQuestionIndex;
  const percentage = (current / total) * 100;

  progressBar.style.width = percentage + "%";
  progressText.textContent = `${current}/${total}`;
}

function speak(text) {
  return new Promise((resolve, reject) => {
    synth.cancel();

    currentUtterance = new SpeechSynthesisUtterance(text);

    // Use selected voice from prioritized list
    const selectedIndex = Number.parseInt(voiceSelect.value, 10);
    if (sortedVoices[selectedIndex]) {
      currentUtterance.voice = sortedVoices[selectedIndex];
      currentUtterance.lang = sortedVoices[selectedIndex].lang;
    } else {
      currentUtterance.lang = currentLanguage === "vi" ? "vi-VN" : "en-US";
    }

    currentUtterance.rate = Number.parseFloat(speedControl.value);
    currentUtterance.pitch = 1;
    currentUtterance.volume = 1;

    currentUtterance.onend = resolve;
    currentUtterance.onerror = reject;

    synth.speak(currentUtterance);
  });
}

function showQuestion() {
  const questions = getCurrentQuestions();
  if (!questions.length) {
    questionText.textContent =
      currentLanguage === "vi"
        ? "Bài này chưa có câu hỏi tiếng Việt."
        : "This lesson has no questions.";
    return;
  }

  const question = questions[currentQuestionIndex];
  questionNumber.textContent = `Câu hỏi ${currentQuestionIndex + 1}/${
    questions.length
  }`;
  questionText.textContent = question;

  // Always reset the input when moving to a new question
  if (answerInput) answerInput.value = "";
  renderCompletedList();

  // Show replay button when question is displayed
  if (replayBtn) {
    replayBtn.style.display = "block";
  }

  // Update navigation buttons state
  updateNavigationButtons();

  statusIndicator.style.display = "block";
  statusIndicator.className = "status-indicator status-speaking";
  statusIndicator.textContent = "🔊 Đang đọc câu hỏi...";

  speak(question)
    .then(() => {
      if (isRunning && !isPaused) {
        startTimer();
      }
    })
    .catch((error) => {
      console.error("Speech error:", error);
      if (isRunning && !isPaused) {
        startTimer();
      }
    });
}

function replayQuestion() {
  const questions = getCurrentQuestions();
  if (!questions.length || currentQuestionIndex < 0) {
    return;
  }

  const question = questions[currentQuestionIndex];
  
  // Only stop current speech, keep timer running
  synth.cancel();

  // Update status indicator
  statusIndicator.style.display = "block";
  statusIndicator.className = "status-indicator status-speaking";
  statusIndicator.textContent = "🔊 Đang đọc lại câu hỏi...";

  // Speak the question again
  speak(question)
    .then(() => {
      if (isRunning && !isPaused) {
        // Timer is still running, just update status
        statusIndicator.className = "status-indicator status-waiting";
        statusIndicator.textContent =
          "⏱️ Thời gian trả lời - Hãy nói câu trả lời của bạn!";
      } else {
        // If not running, just show waiting status
        statusIndicator.className = "status-indicator status-waiting";
        statusIndicator.textContent = "✅ Đã đọc xong";
      }
    })
    .catch((error) => {
      console.error("Speech error:", error);
      statusIndicator.className = "status-indicator status-waiting";
      statusIndicator.textContent = "❌ Lỗi khi đọc câu hỏi";
    });
}

function startTimer() {
  timeRemaining = settings.timerDuration || 50;
  timerValue.textContent = timeRemaining;
  timerValue.classList.remove("warning");

  statusIndicator.className = "status-indicator status-waiting";
  statusIndicator.textContent =
    "⏱️ Thời gian trả lời - Hãy nói câu trả lời của bạn!";

  timer = setInterval(() => {
    if (!isPaused) {
      timeRemaining--;
      timerValue.textContent = timeRemaining;

      if (timeRemaining <= 10) {
        timerValue.classList.add("warning");
      }

      if (timeRemaining <= 0) {
        stopTimer();
        nextQuestion();
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function nextQuestion() {
  const questions = getCurrentQuestions();
  if (currentQuestionIndex < questions.length - 1) {
    currentQuestionIndex++;
    stopTimer();
    synth.cancel();
    updateProgress();
    showQuestion();
  } else {
    completeLesson();
  }
}

function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    stopTimer();
    synth.cancel();
    updateProgress();
    showQuestion();
  }
}

function updateNavigationButtons() {
  const questions = getCurrentQuestions();
  if (!questions.length) {
    return;
  }

  const totalQuestions = questions.length;
  
  // Enable/disable Previous button
  prevBtn.disabled = currentQuestionIndex === 0;
  
  // Enable/disable Next button
  nextBtn.disabled = currentQuestionIndex >= totalQuestions - 1;
}

function completeLesson() {
  isRunning = false;
  stopTimer();
  synth.cancel();

  document.querySelector(".question-display").style.display = "none";
  document.querySelector(".timer-display").style.display = "none";
  document.querySelector(".controls").style.display = "none";
  navigationControls.style.display = "none";
  statusIndicator.style.display = "none";
  completionMessage.style.display = "block";
  
  if (replayBtn) {
    replayBtn.style.display = "none";
  }
  if (answerSection) {
    answerSection.style.display = "none";
  }
  if (completedSection) {
    // keep the completed list visible after finishing
    renderCompletedList();
  }

  // Show Start button, hide Pause and Stop buttons
  startBtn.style.display = "block";
  pauseBtn.style.display = "none";
  stopBtn.style.display = "none";
  startBtn.disabled = false;
  prevBtn.disabled = true;
  nextBtn.disabled = true;
}

// Control buttons
startBtn.addEventListener("click", () => {
  if (!isRunning) {
    isRunning = true;
    isPaused = false;
    currentQuestionIndex = 0;

    // Reset "Câu đã trả lời" when starting a new lesson run
    clearAnswersForCurrentLesson();

    document.querySelector(".question-display").style.display = "flex";
    document.querySelector(".timer-display").style.display = "block";
    document.querySelector(".controls").style.display = "flex";
    navigationControls.style.display = "flex";
    completionMessage.style.display = "none";
    if (answerSection) answerSection.style.display = "block";
    if (answerInput) answerInput.value = "";
    renderCompletedList();

    // Hide Start button, show Pause and Stop buttons
    startBtn.style.display = "none";
    pauseBtn.style.display = "block";
    stopBtn.style.display = "block";
    pauseBtn.disabled = false;
    stopBtn.disabled = false;

    updateProgress();
    showQuestion();
  }
});

saveAnswerBtn?.addEventListener("click", () => {
  if (!currentLesson) return;
  const questions = getCurrentQuestions();
  if (!questions.length) return;

  const value = (answerInput?.value || "").trim();
  if (!value) {
    alert(currentLanguage === "vi" ? "Vui lòng nhập câu trả lời." : "Please enter an answer.");
    return;
  }

  setSavedAnswer(currentQuestionIndex, value);
  renderCompletedList();

  // Continue to next question automatically (keeps the flow)
  stopTimer();
  nextQuestion();
});

pauseBtn.addEventListener("click", () => {
  if (isRunning) {
    isPaused = !isPaused;

    if (isPaused) {
      synth.pause();
      pauseBtn.textContent = "▶️ Resume";
      statusIndicator.textContent = "⏸️ Đã tạm dừng";
    } else {
      synth.resume();
      pauseBtn.textContent = "⏸️ Pause";
      if (timer) {
        statusIndicator.className = "status-indicator status-waiting";
        statusIndicator.textContent =
          "⏱️ Thời gian trả lời - Hãy nói câu trả lời của bạn!";
      } else {
        statusIndicator.className = "status-indicator status-speaking";
        statusIndicator.textContent = "🔊 Đang đọc câu hỏi...";
      }
    }
  }
});

stopBtn.addEventListener("click", () => {
  if (confirm("Bạn có chắc muốn dừng bài học?")) {
    resetPractice();
  }
});

restartBtn.addEventListener("click", () => {
  resetPractice();
});

// Navigation buttons
prevBtn.addEventListener("click", () => {
  if (!prevBtn.disabled) {
    previousQuestion();
  }
});

nextBtn.addEventListener("click", () => {
  if (!nextBtn.disabled) {
    nextQuestion();
  }
});

// Replay button
replayBtn.addEventListener("click", () => {
  replayQuestion();
});

