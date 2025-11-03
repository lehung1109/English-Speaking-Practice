let lessons = {};
let config = {};
let settings = {};

let currentLesson = null;
let currentQuestionIndex = 0;
let timer = null;
let timeRemaining = 50;
let isPaused = false;
let isRunning = false;
let synth = window.speechSynthesis;
let voices = [];
let sortedVoices = [];
let currentUtterance = null;

// Elements
const lessonBtns = document.querySelectorAll(".lesson-btn");
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
const voiceSelect = document.getElementById("voiceSelect");
const speedControl = document.getElementById("speedControl");
const speedValue = document.getElementById("speedValue");

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
      defaultSpeed: 1.0,
      minSpeed: 0.5,
      maxSpeed: 2.0,
      speedStep: 0.1,
    };

    // Initialize timer duration
    timeRemaining = settings.timerDuration;
    timerValue.textContent = timeRemaining.toString();

    // Initialize speed control from config
    speedControl.min = settings.minSpeed;
    speedControl.max = settings.maxSpeed;
    speedControl.step = settings.speedStep;
    speedControl.value = settings.defaultSpeed;
    speedValue.textContent = settings.defaultSpeed + "x";

    console.log("Config loaded successfully");
  } catch (error) {
    console.error("Error loading config:", error);
    alert("Không thể tải cấu hình. Vui lòng kiểm tra file config.json");
  }
}

// Load config on page load
loadConfig();

// Load and prioritize voices
function loadVoices() {
  voices = synth.getVoices();

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

  // Populate select dropdown
  voiceSelect.innerHTML = "";

  if (sortedVoices.length === 0) {
    voiceSelect.innerHTML =
      "<option>No English voices available</option>";
  } else {
    sortedVoices.forEach((voice, index) => {
      const option = document.createElement("option");
      option.value = index;

      // Add badge based on voice type
      let badge = "";
      if (voice.lang.startsWith("en-US")) {
        badge = " 🇺🇸 [Recommended]";
      } else if (voice.lang.startsWith("en-GB")) {
        badge = " 🇬🇧";
      }

      option.textContent = `${voice.name} (${voice.lang})${badge}`;

      // Auto-select first US voice (index 0 if available)
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

speedControl.addEventListener("input", (e) => {
  speedValue.textContent = e.target.value + "x";
});

// Lesson selection
lessonBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const lessonNum = parseInt(btn.dataset.lesson);
    selectLesson(lessonNum);
  });
});

function selectLesson(lessonNum) {
  if (!lessons || !lessons[lessonNum]) {
    alert("Cấu hình chưa được tải. Vui lòng đợi...");
    return;
  }
  currentLesson = lessons[lessonNum];
  currentQuestionIndex = 0;

  lessonBtns.forEach((btn) => {
    btn.classList.toggle(
      "active",
      parseInt(btn.dataset.lesson) === lessonNum
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

  startBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;

  updateProgress();
}

function updateProgress() {
  if (!currentLesson || !currentLesson.questions) {
    return;
  }
  const total = currentLesson.questions.length;
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
    const selectedIndex = parseInt(voiceSelect.value);
    if (sortedVoices[selectedIndex]) {
      currentUtterance.voice = sortedVoices[selectedIndex];
    }

    currentUtterance.rate = parseFloat(speedControl.value);
    currentUtterance.pitch = 1;
    currentUtterance.volume = 1;

    currentUtterance.onend = resolve;
    currentUtterance.onerror = reject;

    synth.speak(currentUtterance);
  });
}

function showQuestion() {
  const question = currentLesson.questions[currentQuestionIndex];
  questionNumber.textContent = `Câu hỏi ${currentQuestionIndex + 1}/${
    currentLesson.questions.length
  }`;
  questionText.textContent = question;

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
  currentQuestionIndex++;
  updateProgress();

  if (currentQuestionIndex >= currentLesson.questions.length) {
    completeLesson();
  } else {
    showQuestion();
  }
}

function completeLesson() {
  isRunning = false;
  stopTimer();
  synth.cancel();

  document.querySelector(".question-display").style.display = "none";
  document.querySelector(".timer-display").style.display = "none";
  document.querySelector(".controls").style.display = "none";
  statusIndicator.style.display = "none";
  completionMessage.style.display = "block";

  startBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
}

// Control buttons
startBtn.addEventListener("click", () => {
  if (!isRunning) {
    isRunning = true;
    isPaused = false;
    currentQuestionIndex = 0;

    document.querySelector(".question-display").style.display = "flex";
    document.querySelector(".timer-display").style.display = "block";
    document.querySelector(".controls").style.display = "flex";
    completionMessage.style.display = "none";

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;

    updateProgress();
    showQuestion();
  }
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

