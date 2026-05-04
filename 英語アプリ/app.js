const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const lyricsInput = document.getElementById("lyrics-input");
const fillSampleButton = document.getElementById("fill-sample");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const statusText = document.getElementById("status-text");
const supportNote = document.getElementById("support-note");
const recognizedText = document.getElementById("recognized-text");
const diffOutput = document.getElementById("diff-output");
const matchScore = document.getElementById("match-score");
const confidenceScore = document.getElementById("confidence-score");
const playback = document.getElementById("playback");

let recognition;
let mediaRecorder;
let audioChunks = [];
let lastTranscript = "";
let lastConfidence = null;

const sampleLyrics = `You are my fire
The one desire
Believe when I say
I want it that way`;

fillSampleButton.addEventListener("click", () => {
  lyricsInput.value = sampleLyrics;
  lyricsInput.focus();
});

const setStatus = (message) => {
  statusText.textContent = message;
};

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text) => normalize(text).split(" ").filter(Boolean);

const buildDiff = (expected, actual) => {
  const dp = Array.from({ length: expected.length + 1 }, () =>
    Array(actual.length + 1).fill(0)
  );

  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      if (expected[i - 1] === actual[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const tokens = [];
  let i = expected.length;
  let j = actual.length;

  while (i > 0 && j > 0) {
    if (expected[i - 1] === actual[j - 1]) {
      tokens.unshift({ type: "hit", value: expected[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      tokens.unshift({ type: "miss", value: expected[i - 1] });
      i -= 1;
    } else {
      tokens.unshift({ type: "extra", value: actual[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    tokens.unshift({ type: "miss", value: expected[i - 1] });
    i -= 1;
  }

  while (j > 0) {
    tokens.unshift({ type: "extra", value: actual[j - 1] });
    j -= 1;
  }

  return tokens;
};

const renderDiff = (expectedText, actualText) => {
  const expectedTokens = tokenize(expectedText);
  const actualTokens = tokenize(actualText);

  diffOutput.innerHTML = "";

  if (!expectedTokens.length && !actualTokens.length) {
    diffOutput.innerHTML = '<p class="muted">ここに比較結果が表示されます。</p>';
    matchScore.textContent = "0%";
    return;
  }

  const diff = buildDiff(expectedTokens, actualTokens);
  const hitCount = diff.filter((token) => token.type === "hit").length;
  const total = expectedTokens.length || 1;
  const score = Math.round((hitCount / total) * 100);

  matchScore.textContent = `${score}%`;

  diff.forEach((token) => {
    const chip = document.createElement("span");
    chip.className = `word-chip ${token.type}`;
    chip.textContent = token.value;
    diffOutput.appendChild(chip);
  });
};

const updateResults = () => {
  recognizedText.textContent =
    lastTranscript || "まだ結果はありません。";
  recognizedText.classList.toggle("muted", !lastTranscript);
  renderDiff(lyricsInput.value, lastTranscript);
  confidenceScore.textContent =
    typeof lastConfidence === "number"
      ? `${Math.round(lastConfidence * 100)}%`
      : "-";
};

const stopRecording = () => {
  if (recognition) {
    recognition.stop();
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  startButton.disabled = false;
  stopButton.disabled = true;
};

const startAudioCapture = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener("stop", () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    playback.src = URL.createObjectURL(audioBlob);
    stream.getTracks().forEach((track) => track.stop());
  });

  mediaRecorder.start();
};

const canStartPractice = () => {
  if (!lyricsInput.value.trim()) {
    setStatus("先に歌詞や練習したいフレーズを入れてください。");
    lyricsInput.focus();
    return false;
  }

  if (!SpeechRecognition) {
    setStatus("このブラウザは音声認識に対応していません。Chrome を試してください。");
    return false;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("このブラウザは録音機能に対応していません。");
    return false;
  }

  return true;
};

const configureRecognition = () => {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    setStatus("録音中です。歌詞を読んでみてください。");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    let confidence = null;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      transcript += `${result[0].transcript} `;

      if (result.isFinal) {
        confidence = result[0].confidence;
      }
    }

    if (transcript.trim()) {
      lastTranscript = transcript.trim();
    }

    if (confidence !== null) {
      lastConfidence = confidence;
    }

    updateResults();
  };

  recognition.onerror = (event) => {
    const messages = {
      "no-speech": "声がうまく入らなかったようです。もう一度試してください。",
      "audio-capture": "マイクを使えませんでした。ブラウザの権限を確認してください。",
      "not-allowed": "マイク利用が許可されていません。ブラウザの設定を確認してください。"
    };

    setStatus(messages[event.error] || `音声認識エラー: ${event.error}`);
    stopRecording();
  };

  recognition.onend = () => {
    if (!stopButton.disabled) {
      setStatus("認識が終了しました。結果を確認してください。");
      stopRecording();
    }
  };
};

startButton.addEventListener("click", async () => {
  if (!canStartPractice()) {
    return;
  }

  lastTranscript = "";
  lastConfidence = null;
  playback.removeAttribute("src");
  updateResults();

  startButton.disabled = true;
  stopButton.disabled = false;

  try {
    if (!recognition) {
      configureRecognition();
    }

    await startAudioCapture();
    recognition.start();
  } catch (error) {
    setStatus(`開始できませんでした: ${error.message}`);
    stopRecording();
  }
});

stopButton.addEventListener("click", () => {
  setStatus("停止しました。結果を確認してください。");
  stopRecording();
});

supportNote.textContent = SpeechRecognition
  ? "音声認識に対応しています。英語設定でチェックします。"
  : "このブラウザでは音声認識が使えません。Chrome の最新版推奨です。";

renderDiff("", "");
