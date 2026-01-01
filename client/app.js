const askView = document.getElementById("ask-view");
const settingsView = document.getElementById("settings-view");
const askTab = document.getElementById("ask-tab");
const settingsTab = document.getElementById("settings-tab");
const questionForm = document.getElementById("question-form");
const questionInput = document.getElementById("question-input");
const answersEl = document.getElementById("answers");
const askHint = document.getElementById("ask-hint");
const apiStatus = document.getElementById("api-status");
const settingsForm = document.getElementById("settings-form");
const settingsHint = document.getElementById("settings-hint");
const apiKeyInput = document.getElementById("api-key");
const traditionsEl = document.getElementById("traditions");
const selectionHint = document.getElementById("selection-hint");
const bodyEl = document.body;
const sendingTextEl = document.getElementById("sending-text");
const shareRow = document.getElementById("share-row");
const shareLinkInput = document.getElementById("share-link");
const shareCopyBtn = document.getElementById("copy-share");
const shareHint = document.getElementById("share-hint");

const TRADITIONS = [
  "Buddhist",
  "Taoist",
  "Hindu",
  "Christian",
  "Muslim",
  "Jewish",
  "Sikh",
  "Shinto",
  "Confucian",
  "Baha'i",
  "Jain",
  "Zoroastrian",
];
const MAX_TRADITIONS = 7;
const selectedTraditions = new Set();
let lastAnswers = [];
let lastQuestion = "";
let lastSelected = [];
let shareSlug = null;

const views = {
  ask: () => {
    askView.classList.remove("hidden");
    settingsView.classList.add("hidden");
    askTab.classList.add("active");
    settingsTab.classList.remove("active");
  },
  settings: () => {
    settingsView.classList.remove("hidden");
    askView.classList.add("hidden");
    settingsTab.classList.add("active");
    askTab.classList.remove("active");
  },
};

function switchView(view) {
  if (views[view]) views[view]();
}

[askTab, settingsTab].forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

async function refreshStatus() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("Failed to read settings");
    const data = await res.json();
    const updated = data.last_updated
      ? new Date(data.last_updated).toLocaleString()
      : "not yet set";
    apiStatus.textContent = data.has_api_key
      ? `API key set (updated ${updated})`
      : "API key missing";
  } catch (err) {
    console.error(err);
    apiStatus.textContent = "Unable to check API key";
  }
}

function renderAnswers(answers) {
  answersEl.innerHTML = "";
  if (!answers || !answers.length) return;

  answers.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3>${entry.tradition} scholar</h3>
      <p>${entry.answer.replace(/\n/g, "<br>")}</p>
    `;
    answersEl.appendChild(card);
  });
}

function renderTraditions() {
  traditionsEl.innerHTML = "";
  TRADITIONS.forEach((tradition) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pill";
    btn.textContent = tradition;
    btn.dataset.tradition = tradition;
    if (selectedTraditions.has(tradition)) {
      btn.classList.add("selected");
    }

    btn.addEventListener("click", () => {
      if (selectedTraditions.has(tradition)) {
        selectedTraditions.delete(tradition);
        btn.classList.remove("selected");
      } else {
        if (selectedTraditions.size >= MAX_TRADITIONS) {
          selectionHint.textContent = `Limit reached: ${MAX_TRADITIONS} scholars max.`;
          return;
        }
        selectedTraditions.add(tradition);
        btn.classList.add("selected");
      }

      selectionHint.textContent =
        selectedTraditions.size > 0
          ? `${selectedTraditions.size} selected`
          : "Choose who should answer.";
    });

    traditionsEl.appendChild(btn);
  });
}

questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  if (!selectedTraditions.size) {
    selectionHint.textContent = "Pick at least one scholar (up to 7).";
    return;
  }

  askHint.textContent = "Sending...";
  answersEl.innerHTML = "";
  bodyEl.classList.add("sending");
  const steps = [
    "Whispering your question into the ether...",
    "Gathering the seven around the fire...",
    "Listening for their voices...",
    "Carrying their wisdom back to you...",
    "Letting time slow to make space for insight...",
    "Watching embers drift and spark new thoughts...",
    "Cradling your words in patient silence...",
    "Letting night air cool and clear the mind...",
    "Waiting as the river reflects the moon...",
    "Holding stillness so answers can surface...",
    "Drawing threads of wisdom from distant halls...",
    "Returning with stories stitched in quiet glow...",
  ];
  let stepIdx = 0;
  sendingTextEl.textContent = steps[stepIdx];
  const stepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % steps.length;
    sendingTextEl.textContent = steps[stepIdx];
  }, 1250);

  const payload = { question, traditions: Array.from(selectedTraditions) };
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Request failed");
    }

    const data = await res.json();
    renderAnswers(data.answers);
    askHint.textContent = "Finished.";
    lastAnswers = data.answers;
    lastQuestion = question;
    lastSelected = Array.from(selectedTraditions);
    shareRow.classList.remove("hidden");
    shareSlug = data.slug || null;
    if (shareSlug) {
      const url = `${window.location.origin}/?share=${shareSlug}`;
      shareLinkInput.value = url;
      shareHint.textContent = "Link ready. Copy and share—no new LLM calls.";
    } else {
      shareHint.textContent = "This link replays these answers without a new call.";
      shareLinkInput.value = "";
    }
  } catch (err) {
    console.error(err);
    askHint.textContent = err.message || "Something went wrong.";
  } finally {
    clearInterval(stepTimer);
    bodyEl.classList.remove("sending");
    sendingTextEl.textContent = "Preparing...";
  }
});

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) return;

  settingsHint.textContent = "Saving...";

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!res.ok) throw new Error("Unable to save key");

    await res.json();
    settingsHint.textContent = "Saved.";
    apiKeyInput.value = "";
    refreshStatus();
  } catch (err) {
    console.error(err);
    settingsHint.textContent = err.message || "Failed to save.";
  }
});

refreshStatus();
renderTraditions();

shareCopyBtn.addEventListener("click", async () => {
  const link = shareLinkInput.value.trim();
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    shareHint.textContent = "Link copied.";
  } catch (err) {
    console.error(err);
    shareHint.textContent = "Copy failed—select and copy manually.";
  }
});

async function loadShareFromURL() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("share");
  if (!slug) return;

  try {
    const res = await fetch(`/api/share/${slug}`);
    if (!res.ok) throw new Error("Share not found");
    const data = await res.json();

    // hydrate UI
    questionInput.value = data.question;
    selectedTraditions.clear();
    data.traditions.forEach((t) => selectedTraditions.add(t));
    renderTraditions();
    // mark selected pills
    Array.from(traditionsEl.children).forEach((btn) => {
      if (selectedTraditions.has(btn.dataset.tradition)) btn.classList.add("selected");
    });

    renderAnswers(data.answers);
    askHint.textContent = "Viewing shared answers.";
    lastAnswers = data.answers;
    lastQuestion = data.question;
    lastSelected = data.traditions;
    shareRow.classList.remove("hidden");
    shareSlug = data.slug;
    const url = `${window.location.origin}/?share=${shareSlug}`;
    shareLinkInput.value = url;
    shareHint.textContent = "This link replays the saved answers.";
  } catch (err) {
    console.error(err);
    askHint.textContent = "Share link not found.";
  }
}

loadShareFromURL();
