const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

const elements = {
  playReference: document.getElementById("play-reference"),
  startSession: document.getElementById("start-session"),
  stopSession: document.getElementById("stop-session"),
  lyricsInput: document.getElementById("lyrics-input"),
  rateInput: document.getElementById("rate-input"),
  langSelect: document.getElementById("lang-select"),
  recognizedOutput: document.getElementById("recognized-output"),
  tokenGrid: document.getElementById("token-grid"),
  sessionStatus: document.getElementById("session-status"),
  scoreValue: document.getElementById("score-value"),
  wordCount: document.getElementById("word-count"),
  clarityValue: document.getElementById("clarity-value"),
  meterFill: document.getElementById("meter-fill"),
  meterText: document.getElementById("meter-text"),
  supportText: document.getElementById("support-text"),
  playback: document.getElementById("playback"),
  recognitionNote: document.getElementById("recognition-note"),
};

const state = {
  recognition: null,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  transcript: "",
  isRecording: false,
  analyser: null,
  levelHistory: [],
  animationFrame: null,
};

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(" ") : [];
}

function buildLcsFlags(targetTokens, spokenTokens) {
  const dp = Array.from({ length: targetTokens.length + 1 }, () =>
    Array(spokenTokens.length + 1).fill(0),
  );

  for (let i = 1; i <= targetTokens.length; i += 1) {
    for (let j = 1; j <= spokenTokens.length; j += 1) {
      if (targetTokens[i - 1] === spokenTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedIndexes = new Set();
  let i = targetTokens.length;
  let j = spokenTokens.length;

  while (i > 0 && j > 0) {
    if (targetTokens[i - 1] === spokenTokens[j - 1]) {
      matchedIndexes.add(i - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return targetTokens.map((token, index) => ({
    token,
    matched: matchedIndexes.has(index),
  }));
}

function renderTokens(targetTokens, spokenTokens) {
  const flags = buildLcsFlags(targetTokens, spokenTokens);
  elements.tokenGrid.innerHTML = "";

  if (!flags.length) {
    elements.tokenGrid.innerHTML =
      '<span class="token">歌詞を入れるとここに単語が並びます。</span>';
    return;
  }

  flags.forEach(({ token, matched }) => {
    const span = document.createElement("span");
    span.className = `token ${matched ? "is-match" : "is-miss"}`;
    span.textContent = token;
    elements.tokenGrid.appendChild(span);
  });
}

function updateScore() {
  const targetTokens = tokenize(elements.lyricsInput.value);
  const spokenTokens = tokenize(state.transcript);
  const flags = buildLcsFlags(targetTokens, spokenTokens);
  const matchedCount = flags.filter((item) => item.matched).length;
  const score = targetTokens.length
    ? Math.round((matchedCount / targetTokens.length) * 100)
    : 0;

  elements.scoreValue.textContent = `${score}%`;
  elements.wordCount.textContent = `${spokenTokens.length} words`;
  renderTokens(targetTokens, spokenTokens);
}

function updateStatus(text, recording = false) {
  elements.sessionStatus.textContent = text;
  document.body.classList.toggle("status-recording", recording);
}

function updateClarityHint() {
  if (!state.levelHistory.length) {
    elements.clarityValue.textContent = "まだ測定前";
    return;
  }

  const average =
    state.levelHistory.reduce((sum, value) => sum + value, 0) /
    state.levelHistory.length;

  if (average < 0.045) {
    elements.clarityValue.textContent = "かなり小さめ";
  } else if (average < 0.09) {
    elements.clarityValue.textContent = "少し弱め";
  } else if (average < 0.16) {
    elements.clarityValue.textContent = "いい感じ";
  } else {
    elements.clarityValue.textContent = "はっきり強め";
  }
}

function monitorMicLevel(stream) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  state.analyser = analyser;

  const data = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (!state.analyser) {
      return;
    }

    state.analyser.getByteTimeDomainData(data);
    let sum = 0;

    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / data.length);
    state.levelHistory.push(rms);
    if (state.levelHistory.length > 120) {
      state.levelHistory.shift();
    }

    const width = Math.min(100, Math.max(4, Math.round(rms * 700)));
    elements.meterFill.style.width = `${width}%`;
    elements.meterText.textContent = `${Math.round(rms * 1000)} level`;

    state.animationFrame = requestAnimationFrame(tick);
  };

  tick();
}

function stopMicMonitoring() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  state.analyser = null;
}

function speakReference() {
  const lyrics = normalizeText(elements.lyricsInput.value);
  if (!lyrics) {
    updateStatus("歌詞を入れてから見本を再生してください");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(elements.lyricsInput.value);
  utterance.lang = elements.langSelect.value;
  utterance.rate = Number(elements.rateInput.value);
  utterance.pitch = 1;
  utterance.onstart = () => updateStatus("見本を再生中");
  utterance.onend = () => updateStatus("待機中");
  window.speechSynthesis.speak(utterance);
}

async function setupAudioStream() {
  if (state.mediaStream) {
    return state.mediaStream;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.mediaStream = stream;
  return stream;
}

function createRecognition() {
  if (!SpeechRecognition) {
    elements.recognitionNote.textContent =
      "このブラウザは音声認識に未対応です。録音と再生のみ利用できます。";
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = elements.langSelect.value;
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    state.transcript = transcript;
    elements.recognizedOutput.textContent = transcript || "聞き取り中...";
    updateScore();
  };

  recognition.onerror = (event) => {
    updateStatus(`認識エラー: ${event.error}`);
  };

  recognition.onend = () => {
    if (state.isRecording) {
      recognition.start();
    }
  };

  return recognition;
}

async function startSession() {
  try {
    const stream = await setupAudioStream();
    state.levelHistory = [];
    state.transcript = "";
    elements.recognizedOutput.textContent = "聞き取り中...";
    elements.playback.removeAttribute("src");
    updateScore();

    state.mediaRecorder = new MediaRecorder(stream);
    state.audioChunks = [];
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
      elements.playback.src = URL.createObjectURL(audioBlob);
      updateClarityHint();
    };

    state.recognition = createRecognition();
    if (state.recognition) {
      state.recognition.lang = elements.langSelect.value;
      state.recognition.start();
    }

    state.mediaRecorder.start();
    monitorMicLevel(stream);
    state.isRecording = true;
    elements.startSession.disabled = true;
    elements.stopSession.disabled = false;
    updateStatus("録音中", true);
    elements.supportText.textContent =
      "録音を止めると、再生と単語比較が更新されます。";
  } catch (error) {
    updateStatus("マイクを使えませんでした");
    elements.supportText.textContent =
      error instanceof Error ? error.message : "unknown error";
  }
}

function stopTracks(stream) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
}

function stopSession() {
  state.isRecording = false;
  elements.startSession.disabled = false;
  elements.stopSession.disabled = true;

  if (state.recognition) {
    state.recognition.onend = null;
    state.recognition.stop();
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }

  stopMicMonitoring();
  stopTracks(state.mediaStream);
  state.mediaStream = null;

  updateClarityHint();
  updateScore();
  updateStatus("判定完了");
}

elements.playReference.addEventListener("click", speakReference);
elements.startSession.addEventListener("click", startSession);
elements.stopSession.addEventListener("click", stopSession);
elements.lyricsInput.addEventListener("input", updateScore);
elements.langSelect.addEventListener("change", () => {
  if (state.recognition) {
    state.recognition.lang = elements.langSelect.value;
  }
});

updateScore();
