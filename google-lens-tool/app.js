const input = document.querySelector("#imageInput");
const viewer = document.querySelector("#viewer");
const canvas = document.querySelector("#imageCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.querySelector("#emptyState");
const selection = document.querySelector("#selection");
const queryInput = document.querySelector("#queryInput");
const searchButton = document.querySelector("#searchButton");
const googleLink = document.querySelector("#googleLink");
const imageLink = document.querySelector("#imageLink");
const barcodeResults = document.querySelector("#barcodeResults");
const supportBadge = document.querySelector("#supportBadge");
const imageMeta = document.querySelector("#imageMeta");
const palette = document.querySelector("#palette");
const objectNameInput = document.querySelector("#objectNameInput");
const labelStyleSelect = document.querySelector("#labelStyleSelect");
const makeImageButton = document.querySelector("#makeImageButton");
const saveCropCheck = document.querySelector("#saveCropCheck");
const dateStampCheck = document.querySelector("#dateStampCheck");
const savePreview = document.querySelector("#savePreview");
const saveStatus = document.querySelector("#saveStatus");
const downloadImageLink = document.querySelector("#downloadImageLink");
const languageSelect = document.querySelector("#languageSelect");
const ocrButton = document.querySelector("#ocrButton");
const ocrStatus = document.querySelector("#ocrStatus");
const ocrOutput = document.querySelector("#ocrOutput");
const enhanceCheck = document.querySelector("#enhanceCheck");
const cropCheck = document.querySelector("#cropCheck");
const useOcrButton = document.querySelector("#useOcrButton");
const copyOcrButton = document.querySelector("#copyOcrButton");
const fitButton = document.querySelector("#fitButton");
const zoomInButton = document.querySelector("#zoomInButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const clearButton = document.querySelector("#clearButton");

let image = null;
let imageName = "";
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let dragStart = null;
let selectionRect = null;
let isReadingText = false;
let saveObjectUrl = null;

const barcodeDetector =
  "BarcodeDetector" in window
    ? new BarcodeDetector({
        formats: [
          "qr_code",
          "ean_13",
          "ean_8",
          "code_128",
          "code_39",
          "upc_a",
          "upc_e",
        ],
      })
    : null;

supportBadge.textContent = barcodeDetector ? "対応" : "未対応";

function resizeCanvas() {
  const rect = viewer.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function fitImage() {
  if (!image) return;

  const rect = viewer.getBoundingClientRect();
  scale = Math.min(rect.width / image.width, rect.height / image.height) * 0.96;
  offsetX = (rect.width - image.width * scale) / 2;
  offsetY = (rect.height - image.height * scale) / 2;
  draw();
}

function draw() {
  const rect = viewer.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!image) return;

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);
}

function setSearchLinks() {
  const query = queryInput.value.trim();
  const encoded = encodeURIComponent(query || imageName || "Google Lens");
  googleLink.href = `https://www.google.com/search?q=${encoded}`;
  imageLink.href = `https://www.google.com/search?tbm=isch&q=${encoded}`;
}

function updateMeta(file) {
  if (!image) {
    imageMeta.textContent = "未選択";
    return;
  }

  const size = file ? `${Math.round(file.size / 1024)}KB` : "";
  imageMeta.textContent = `${image.width} x ${image.height}${size ? ` / ${size}` : ""}`;
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getDominantColors() {
  if (!image) return [];

  const sample = document.createElement("canvas");
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  const width = 90;
  const height = Math.max(1, Math.round((image.height / image.width) * width));
  sample.width = width;
  sample.height = height;
  sampleCtx.drawImage(image, 0, 0, width, height);

  const data = sampleCtx.getImageData(0, 0, width, height).data;
  const buckets = new Map();

  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 160) continue;

    const color = [
      Math.round(data[index] / 32) * 32,
      Math.round(data[index + 1] / 32) * 32,
      Math.round(data[index + 2] / 32) * 32,
    ].map((value) => Math.min(255, value));
    const key = color.join(",");
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key.split(",").map(Number));
}

function renderPalette() {
  palette.innerHTML = "";
  const colors = getDominantColors();

  if (!colors.length) {
    palette.innerHTML = '<p class="muted">画像を選ぶと主要な色が出ます。</p>';
    return;
  }

  for (const color of colors) {
    const hex = rgbToHex(color);
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.backgroundColor = hex;
    swatch.textContent = hex.toUpperCase();
    swatch.title = `${hex.toUpperCase()} を検索欄へ追加`;
    swatch.addEventListener("click", () => {
      queryInput.value = [queryInput.value.trim(), hex.toUpperCase()].filter(Boolean).join(" ");
      setSearchLinks();
    });
    palette.append(swatch);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentImageCrop() {
  return cropForPurpose(cropCheck.checked);
}

function cropForPurpose(useSelection) {
  if (!image) return null;

  if (!useSelection || !selectionRect || selectionRect.width < 14 || selectionRect.height < 14) {
    return {
      height: image.height,
      width: image.width,
      x: 0,
      y: 0,
    };
  }

  const x = clamp((selectionRect.x - offsetX) / scale, 0, image.width);
  const y = clamp((selectionRect.y - offsetY) / scale, 0, image.height);
  const width = clamp(selectionRect.width / scale, 1, image.width - x);
  const height = clamp(selectionRect.height / scale, 1, image.height - y);

  return { x, y, width, height };
}

function buildOcrCanvas() {
  const crop = currentImageCrop();
  if (!crop) return null;

  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  const targetWidth = Math.min(2600, Math.max(900, Math.round(crop.width * 2)));
  const targetHeight = Math.max(1, Math.round((crop.height / crop.width) * targetWidth));
  source.width = targetWidth;
  source.height = targetHeight;
  sourceCtx.imageSmoothingQuality = "high";
  sourceCtx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  if (!enhanceCheck.checked) return source;

  const frame = sourceCtx.getImageData(0, 0, source.width, source.height);
  const pixels = frame.data;
  let total = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    total += gray;
  }

  const average = total / (pixels.length / 4);
  const threshold = clamp(average * 0.92, 92, 172);

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const highContrast = gray > threshold ? 255 : 0;
    pixels[index] = highContrast;
    pixels[index + 1] = highContrast;
    pixels[index + 2] = highContrast;
  }

  sourceCtx.putImageData(frame, 0, 0);
  return source;
}

function cleanOcrText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function readableFileName(text) {
  return (text || "lens-desk")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  const chars = [...text];
  const lines = [];
  let line = "";

  for (const char of chars) {
    const testLine = line + char;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = char.trimStart();
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  for (let index = 0; index < lines.length; index += 1) {
    context.fillText(lines[index], x, y + index * lineHeight);
  }
}

function makeLabelText() {
  return (
    objectNameInput.value.trim() ||
    queryInput.value.trim() ||
    ocrOutput.value.split("\n").find((line) => line.trim()) ||
    imageName ||
    "名称未設定"
  );
}

function renderNamedImage() {
  if (!image) {
    saveStatus.textContent = "画像なし";
    return;
  }

  const crop = cropForPurpose(saveCropCheck.checked);
  const label = makeLabelText();
  const stamp = dateStampCheck.checked
    ? new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date())
    : "";
  const baseWidth = Math.min(1600, Math.max(760, Math.round(crop.width)));
  const baseHeight = Math.max(1, Math.round((crop.height / crop.width) * baseWidth));
  const labelHeight = Math.max(132, Math.round(baseWidth * 0.18));
  const padding = Math.round(baseWidth * 0.04);
  const output = document.createElement("canvas");
  const outCtx = output.getContext("2d");
  const style = labelStyleSelect.value;

  output.width = baseWidth;
  output.height = style === "overlay" ? baseHeight : baseHeight + labelHeight;

  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, output.width, output.height);

  const imageY = style === "top" ? labelHeight : 0;
  outCtx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    imageY,
    baseWidth,
    baseHeight,
  );

  const fontSize = Math.max(34, Math.round(baseWidth * 0.055));
  const smallFontSize = Math.max(20, Math.round(baseWidth * 0.026));

  if (style === "overlay") {
    const boxHeight = Math.max(150, Math.round(baseHeight * 0.24));
    const y = baseHeight - boxHeight;
    const gradient = outCtx.createLinearGradient(0, y, 0, baseHeight);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.3, "rgba(0, 0, 0, 0.65)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.88)");
    outCtx.fillStyle = gradient;
    outCtx.fillRect(0, y, baseWidth, boxHeight);
    outCtx.fillStyle = "#ffffff";
    outCtx.font = `800 ${fontSize}px system-ui, sans-serif`;
    drawWrappedText(outCtx, label, padding, y + fontSize + 20, baseWidth - padding * 2, fontSize * 1.16);
    if (stamp) {
      outCtx.font = `600 ${smallFontSize}px system-ui, sans-serif`;
      outCtx.fillText(stamp, padding, baseHeight - padding);
    }
  } else {
    const labelY = style === "bottom" ? baseHeight : 0;
    outCtx.fillStyle = "#151719";
    outCtx.fillRect(0, labelY, baseWidth, labelHeight);
    outCtx.fillStyle = "#ffffff";
    outCtx.font = `800 ${fontSize}px system-ui, sans-serif`;
    drawWrappedText(outCtx, label, padding, labelY + fontSize + 18, baseWidth - padding * 2, fontSize * 1.15);
    if (stamp) {
      outCtx.fillStyle = "#cbd5e1";
      outCtx.font = `600 ${smallFontSize}px system-ui, sans-serif`;
      outCtx.fillText(stamp, padding, labelY + labelHeight - 28);
    }
  }

  output.toBlob((blob) => {
    if (!blob) {
      saveStatus.textContent = "作成失敗";
      return;
    }

    if (saveObjectUrl) URL.revokeObjectURL(saveObjectUrl);
    saveObjectUrl = URL.createObjectURL(blob);
    downloadImageLink.href = saveObjectUrl;
    downloadImageLink.download = `${readableFileName(label)}.png`;
    downloadImageLink.setAttribute("aria-disabled", "false");

    savePreview.innerHTML = "";
    const preview = document.createElement("img");
    preview.src = saveObjectUrl;
    preview.alt = `${label} の保存用画像`;
    savePreview.append(preview);
    saveStatus.textContent = "作成済み";
  }, "image/png");
}

async function readTextFromImage() {
  if (!image || isReadingText) return;

  if (!window.Tesseract) {
    ocrStatus.textContent = "読込失敗";
    ocrOutput.value =
      "OCRライブラリを読み込めませんでした。インターネット接続がある状態で再読み込みしてください。";
    return;
  }

  const ocrCanvas = buildOcrCanvas();
  if (!ocrCanvas) return;

  isReadingText = true;
  ocrButton.disabled = true;
  ocrStatus.textContent = "準備中";
  ocrOutput.value = "";

  try {
    const result = await Tesseract.recognize(ocrCanvas, languageSelect.value, {
      logger: (event) => {
        if (event.status === "recognizing text") {
          ocrStatus.textContent = `${Math.round(event.progress * 100)}%`;
        } else if (event.status) {
          ocrStatus.textContent = event.status;
        }
      },
      tessedit_pageseg_mode: "6",
    });
    const text = cleanOcrText(result.data.text);
    ocrOutput.value = text || "文字を検出できませんでした。範囲を狭めるか、精度優先を切り替えてください。";

    if (text) {
      queryInput.value = text.split("\n").slice(0, 3).join(" ");
      objectNameInput.value = objectNameInput.value.trim() || text.split("\n")[0];
      setSearchLinks();
    }

    ocrStatus.textContent = text ? "完了" : "未検出";
  } catch {
    ocrStatus.textContent = "失敗";
    ocrOutput.value =
      "文字認識に失敗しました。画像が大きい場合は範囲選択してからもう一度試してください。";
  } finally {
    isReadingText = false;
    ocrButton.disabled = false;
  }
}

async function detectCodes() {
  if (!image || !barcodeDetector) return;

  barcodeResults.innerHTML = '<p class="muted">検出中...</p>';

  try {
    const codes = await barcodeDetector.detect(canvas);
    if (!codes.length) {
      barcodeResults.innerHTML = '<p class="muted">バーコードやQRコードは見つかりませんでした。</p>';
      return;
    }

    barcodeResults.innerHTML = "";
    for (const code of codes) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "result-item";
      item.innerHTML = `<strong>${code.format}</strong><span>${code.rawValue}</span>`;
      item.addEventListener("click", () => {
        queryInput.value = code.rawValue;
        objectNameInput.value = code.rawValue;
        setSearchLinks();
      });
      barcodeResults.append(item);
    }
  } catch {
    barcodeResults.innerHTML = '<p class="muted">この画像では検出を完了できませんでした。</p>';
  }
}

function showSelection(rect) {
  selection.style.display = "block";
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(start.x - end.x);
  const height = Math.abs(start.y - end.y);
  return { x, y, width, height };
}

function pointerPosition(event) {
  const rect = viewer.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

input.addEventListener("change", () => {
  const [file] = input.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const nextImage = new Image();
    nextImage.addEventListener("load", async () => {
      image = nextImage;
      imageName = file.name.replace(/\.[^.]+$/, "");
      emptyState.hidden = true;
      queryInput.value = imageName.replace(/[-_]/g, " ");
      objectNameInput.value = "";
      selection.style.display = "none";
      selectionRect = null;
      fitImage();
      updateMeta(file);
      renderPalette();
      setSearchLinks();
      await detectCodes();
    });
    nextImage.src = reader.result;
  });
  reader.readAsDataURL(file);
});

viewer.addEventListener("pointerdown", (event) => {
  if (!image) return;
  dragStart = pointerPosition(event);
  selectionRect = null;
  viewer.setPointerCapture(event.pointerId);
});

viewer.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  const current = pointerPosition(event);
  selectionRect = normalizeRect(dragStart, current);
  if (selectionRect.width > 8 && selectionRect.height > 8) {
    showSelection(selectionRect);
  }
});

viewer.addEventListener("pointerup", () => {
  if (!selectionRect || selectionRect.width < 8 || selectionRect.height < 8) {
    selection.style.display = "none";
  } else {
    const terms = [
      queryInput.value.trim(),
      `範囲 ${Math.round(selectionRect.width)}x${Math.round(selectionRect.height)}`,
    ];
    queryInput.value = terms.filter(Boolean).join(" ");
    setSearchLinks();
  }
  dragStart = null;
});

searchButton.addEventListener("click", () => {
  setSearchLinks();
  window.open(googleLink.href, "_blank", "noreferrer");
});

queryInput.addEventListener("input", setSearchLinks);

fitButton.addEventListener("click", fitImage);

zoomInButton.addEventListener("click", () => {
  if (!image) return;
  scale *= 1.18;
  draw();
});

zoomOutButton.addEventListener("click", () => {
  if (!image) return;
  scale /= 1.18;
  draw();
});

clearButton.addEventListener("click", () => {
  image = null;
  imageName = "";
  queryInput.value = "";
  objectNameInput.value = "";
  input.value = "";
  emptyState.hidden = false;
  selection.style.display = "none";
  barcodeResults.innerHTML =
    '<p class="muted">バーコードやQRコードがある画像なら、対応ブラウザで自動検出します。</p>';
  palette.innerHTML = "";
  ocrOutput.value = "";
  ocrStatus.textContent = "未実行";
  savePreview.innerHTML = '<p class="muted">作成した保存用画像がここに出ます。</p>';
  saveStatus.textContent = "未作成";
  downloadImageLink.href = "#";
  downloadImageLink.setAttribute("aria-disabled", "true");
  if (saveObjectUrl) {
    URL.revokeObjectURL(saveObjectUrl);
    saveObjectUrl = null;
  }
  updateMeta();
  setSearchLinks();
  draw();
});

ocrButton.addEventListener("click", readTextFromImage);

useOcrButton.addEventListener("click", () => {
  const text = cleanOcrText(ocrOutput.value);
  if (!text) return;
  queryInput.value = text.split("\n").slice(0, 4).join(" ");
  objectNameInput.value = objectNameInput.value.trim() || text.split("\n")[0];
  setSearchLinks();
});

copyOcrButton.addEventListener("click", async () => {
  const text = ocrOutput.value.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    ocrStatus.textContent = "コピー済み";
  } catch {
    ocrOutput.select();
    document.execCommand("copy");
    ocrStatus.textContent = "コピー済み";
  }
});

makeImageButton.addEventListener("click", renderNamedImage);

queryInput.addEventListener("change", () => {
  if (!objectNameInput.value.trim()) {
    objectNameInput.value = queryInput.value.trim();
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
setSearchLinks();
