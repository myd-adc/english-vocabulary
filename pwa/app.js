import { createQuiz, exampleBlock, shortMeaning } from "./quiz.js";
import { hydrateIcons, iconEl } from "./icons.js";
import {
  canSpeak,
  getSettings,
  setSetting,
  speak,
  speakCard,
  stopSpeaking,
  voiceProblem,
} from "./speech.js";

// ── API ───────────────────────────────────────────────────────────────────────
const API_URL = "/api";
const TOKEN_KEY = "lexi_token";
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    showLogin();
  }
  return res;
}

const $ = (id) => document.getElementById(id);
hydrateIcons();

// ── Service worker ────────────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return; // first install: nothing stale to replace
    refreshing = true;
    window.location.reload();
  });
}

// ── Offline banner ────────────────────────────────────────────────────────────
function updateOnlineStatus() {
  $("offline-banner").classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ── Login ─────────────────────────────────────────────────────────────────────
function showLogin() {
  $("view-login").classList.remove("hidden");
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  $("login-password").value = "";
  $("login-error").classList.add("hidden");
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").classList.add("hidden");
  const loginBtn = e.target.querySelector("button[type=submit]");
  loginBtn.disabled = true;
  loginBtn.setAttribute("aria-busy", "true");
  let res;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("login-password").value }),
    });
  } catch {
    $("login-error").textContent = "Немає з'єднання з сервером.";
    $("login-error").classList.remove("hidden");
    return;
  } finally {
    loginBtn.disabled = false;
    loginBtn.removeAttribute("aria-busy");
  }
  if (res.ok) {
    setToken((await res.json()).token);
    $("view-login").classList.add("hidden");
    loadHome();
  } else {
    $("login-error").textContent =
      res.status === 429 ? "Забагато спроб. Спробуй за кілька хвилин." : "Невірний пароль.";
    $("login-error").classList.remove("hidden");
    $("login-password").select();
  }
});

// ── Views ─────────────────────────────────────────────────────────────────────
const views = {
  home: $("view-home"),
  study: $("view-study"),
  topic: $("view-topic"),
  review: $("view-review"),
};
function showView(name, opts = {}) {
  stopSpeaking();
  quiz.stop();
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
  window.scrollTo(0, 0);
  if (name === "topic") openTopic(opts.name || "");
  if (name === "review") openReview(opts.sections);
}

function showErrorMsg(container, text) {
  const p = document.createElement("p");
  p.className = "error-msg";
  p.textContent = navigator.onLine ? text : "Немає з'єднання.";
  container.appendChild(p);
}

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ── State ─────────────────────────────────────────────────────────────────────
let direction = localStorage.getItem("lexi_dir") === "reverse" ? "reverse" : "forward";
let activity = localStorage.getItem("lexi_activity") === "quiz" ? "quiz" : "cards";
let section = ""; // topic shown on the topic page ("" = all words)
let studySections = []; // topics chosen on the review screen ([] = all)
let sections = [];

const isDifficult = (w) =>
  w.ease_factor < 2.1 || w.reverse_ease_factor < 2.1 || w.lapses >= 2 || w.reverse_lapses >= 2;

// ── Loading placeholders ──────────────────────────────────────────────────────
function skeletons(n, cls) {
  return Array.from({ length: n }, () => {
    const d = document.createElement("div");
    d.className = `skeleton ${cls}`;
    d.setAttribute("aria-hidden", "true");
    return d;
  });
}

let sectionsLoaded = false;

async function loadSections() {
  try {
    const res = await apiFetch("/sections");
    if (!res.ok) return;
    sections = await res.json();
    sectionsLoaded = true;
    $("section-options").replaceChildren(...sections.map((s) => new Option(s.name)));
  } catch {
    // offline — keep what we have
  }
}

async function loadHome() {
  showView("home");
  if (!sectionsLoaded) $("tiles").replaceChildren(...skeletons(4, "skeleton-tile"));
  await loadSections();
  renderTiles();
}

// ── Home: add a word, topic tiles ──────────────────────────────────────────────
const FALLBACK_TOPIC = "Без теми";

function pluralWords(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} слово`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} слова`;
  return `${n} слів`;
}

function renderTiles() {
  const grid = $("tiles");
  const make = (name, count, topic) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile";
    const n = document.createElement("span");
    n.className = "tile-name";
    n.textContent = name;
    const c = document.createElement("span");
    c.className = "tile-count";
    c.textContent = pluralWords(count);
    b.append(n, c);
    b.addEventListener("click", () => showView("topic", { name: topic }));
    return b;
  };
  const total = sections.reduce((sum, s) => sum + s.words, 0);
  grid.replaceChildren(
    ...sections.map((s) => make(s.name, s.words, s.name)),
    make("Усі слова", total, ""),
  );
}

// state of the result card: { status, input, word, saved }
let quickState = null;
let quickWord = null;
let quickBusy = false;
const quickInput = $("quick-input");
const quickResult = $("quick-result");

function resetQuick() {
  quickState = null;
  quickWord = null;
  quickInput.value = "";
  renderQuickResult();
}

function mk(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// "дієслово: бігти, керувати" lines -> a pos label and meanings, the main one in bold
function renderParts(word) {
  const box = mk("div", "parts");
  const main = (word.main_translation || "").trim().toLowerCase();
  for (const line of (word.translation || "").split("\n").filter(Boolean)) {
    const i = line.indexOf(":");
    const row = mk("div", "part");
    const meanings = mk("span", "part-meanings");
    const items = (i > 0 ? line.slice(i + 1) : line).split(",").map((m) => m.trim()).filter(Boolean);
    items.forEach((m, k) => {
      if (k) meanings.append(", ");
      meanings.append(m.toLowerCase() === main ? mk("strong", "", m) : m);
    });
    if (i > 0) row.append(mk("span", "part-pos", line.slice(0, i).trim()));
    else row.classList.add("part-bare");
    row.append(meanings);
    box.append(row);
  }
  return box;
}

function renderQuickResult() {
  quickResult.replaceChildren();
  quickResult.classList.toggle("hidden", !quickState);
  if (!quickState) return;
  const { status, input, word } = quickState;

  if (status === "pending") {
    quickResult.append(mk("h3", "result-word", input));
    quickResult.append(mk("p", "result-status result-pending", "Перекладаю…"));
    return;
  }
  if (status === "error") {
    quickResult.append(
      mk("p", "error-msg", navigator.onLine ? "Не вдалося додати слово." : "Немає з'єднання."),
    );
    return;
  }
  if (status === "not_english") {
    quickResult.append(mk("p", "result-note", "Це не схоже на англійське слово."));
    return;
  }
  if (status === "unavailable") {
    quickResult.append(
      mk("p", "result-note", "Переклад зараз недоступний. Введіть переклад вручну."),
    );
    const form = mk("form", "manual-form");
    form.noValidate = true;
    const inp = mk("input", "manual-input");
    inp.type = "text";
    inp.id = "manual-translation";
    inp.placeholder = "Переклад";
    inp.setAttribute("aria-label", "Переклад");
    inp.autocomplete = "off";
    inp.value = quickState.draft || "";
    inp.addEventListener("input", () => (quickState.draft = inp.value));
    const btn = mk("button", "btn btn-primary quick-add", "Зберегти");
    btn.type = "submit";
    form.append(inp, btn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveManual(inp, btn);
    });
    quickResult.append(form);
    if (quickState.error) quickResult.append(mk("p", "error-msg", quickState.error));
    return;
  }

  // created / exists
  quickResult.append(mk("h3", "result-word", word.word));
  if (input && input.trim().toLowerCase() !== word.word.toLowerCase()) {
    quickResult.append(mk("p", "result-note", `Ви ввели «${input.trim()}» → збережено «${word.word}»`));
  }
  quickResult.append(renderParts(word));
  const meta = mk("div", "result-meta");
  const chip = mk("button", "chip chip-btn", word.section || FALLBACK_TOPIC);
  chip.type = "button";
  chip.setAttribute("aria-label", `Тема: ${word.section || FALLBACK_TOPIC}. Змінити тему`);
  chip.addEventListener("click", () => openEditSheet(quickWord, "section"));
  meta.append(chip);
  meta.append(
    mk("span", "result-status", status === "exists" ? "Уже є у словнику" : "Збережено"),
  );
  quickResult.append(meta);
  const actions = mk("div", "result-actions");
  const edit = mk("button", "btn-edit", "Змінити");
  edit.type = "button";
  edit.addEventListener("click", () => openEditSheet(quickWord));
  const del = mk("button", "btn-delete", "Видалити");
  del.type = "button";
  del.addEventListener("click", deleteQuickWord);
  actions.append(edit, del);
  quickResult.append(actions);
  if (quickState.error) quickResult.append(mk("p", "error-msg", quickState.error));
}

function setQuickBusy(busy) {
  quickBusy = busy;
  const b = $("quick-add");
  b.disabled = busy;
  b.textContent = busy ? "Додаю…" : "Додати";
  b.setAttribute("aria-busy", String(busy));
}

async function refreshTiles() {
  await loadSections();
  renderTiles();
}

quickInput.addEventListener("input", () => {
  quickInput.classList.remove("input-empty");
  quickInput.placeholder = "Англійське слово";
});

$("quick-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = quickInput.value.trim();
  if (quickBusy) return;
  if (!text) {
    // Empty field: say so instead of silently ignoring the tap.
    quickInput.classList.add("input-empty");
    quickInput.placeholder = "Спершу введіть англійське слово";
    quickInput.focus();
    return;
  }
  setQuickBusy(true);
  // Show the word right away; the translation fills in when it arrives.
  quickState = { status: "pending", input: text, word: null };
  quickWord = null;
  renderQuickResult();
  try {
    const res = await apiFetch("/vocabulary/quick", { method: "POST", body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error();
    const r = await res.json();
    quickState = { status: r.status, input: r.input || text, word: r.word };
    quickWord = r.word;
    if (r.status === "created" || r.status === "exists") quickInput.value = "";
    renderQuickResult();
    if (r.status === "created") refreshTiles();
  } catch {
    quickState = { status: "error", input: text, word: null };
    quickWord = null;
    renderQuickResult();
  } finally {
    setQuickBusy(false);
  }
});

async function saveManual(inp, btn) {
  const translation = inp.value.trim();
  if (!translation || quickBusy) return;
  quickBusy = true;
  btn.disabled = true;
  try {
    const res = await apiFetch("/vocabulary", {
      method: "POST",
      body: JSON.stringify({ word: quickState.input.trim(), translation, section: FALLBACK_TOPIC }),
    });
    if (res.status === 409) throw new Error("Таке слово вже є.");
    if (!res.ok) throw new Error("Не вдалося зберегти.");
    const word = await res.json();
    quickState = { status: "created", input: word.word, word };
    quickWord = word;
    quickInput.value = "";
    renderQuickResult();
    refreshTiles();
  } catch (err) {
    quickState.error = err instanceof TypeError ? "Немає з'єднання." : err.message || "Не вдалося зберегти.";
    renderQuickResult();
  } finally {
    quickBusy = false;
  }
}

async function deleteQuickWord() {
  if (!quickWord) return;
  try {
    const res = await apiFetch(`/vocabulary/${quickWord.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
  } catch {
    quickState.error = "Не вдалося видалити.";
    return renderQuickResult();
  }
  quickState = null;
  quickWord = null;
  renderQuickResult();
  refreshTiles();
}

// Header menu
const menuBtn = $("btn-menu");
const appMenu = $("app-menu");
function setMenuOpen(open) {
  appMenu.classList.toggle("hidden", !open);
  menuBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    $("btn-backfill").classList.toggle("hidden", !sections.some((s) => s.name === FALLBACK_TOPIC));
    appMenu.querySelector("[role=menuitem]:not(.hidden)").focus();
  }
}
menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(appMenu.classList.contains("hidden"));
});
document.addEventListener("click", (e) => {
  if (!appMenu.classList.contains("hidden") && !appMenu.contains(e.target)) setMenuOpen(false);
});
const backfillBtn = $("btn-backfill");
$("btn-backfill").addEventListener("click", async () => {
  if (backfillBtn.disabled) return;
  backfillBtn.disabled = true;
  backfillBtn.textContent = "Розкладаю…";
  let total = 0;
  let failed = false;
  try {
    // each call handles a capped batch; stop when nothing was updated (translator down)
    for (;;) {
      const res = await apiFetch("/topics/backfill", { method: "POST" });
      if (!res.ok) throw new Error();
      const { updated, remaining } = await res.json();
      total += updated;
      if (remaining <= 0 || updated === 0) {
        failed = remaining > 0;
        break;
      }
    }
  } catch {
    failed = true;
  }
  await refreshTiles();
  setMenuOpen(false);
  backfillBtn.disabled = false;
  backfillBtn.textContent = "Розкласти слова без теми";
  const note = $("home-note");
  note.textContent = failed
    ? total ? `Розкладено ${pluralWords(total)}. Решту — пізніше.` : "Не вдалося розкласти слова."
    : `Розкладено ${pluralWords(total)}`;
  note.classList.remove("hidden");
  setTimeout(() => note.classList.add("hidden"), 6000);
});
// ── Light / dark theme (menu) ─────────────────────────────────────────────────
const THEME_KEY = "lexivocab-theme";
const THEMES = ["system", "light", "dark"];
const THEME_LABELS = { system: "Оформлення: як у системі", light: "Оформлення: світле", dark: "Оформлення: темне" };
const themeBtn = $("btn-theme");

function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function applyTheme(theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch (_) { /* private mode: theme just isn't remembered */ }
  themeBtn.textContent = THEME_LABELS[theme];
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}

themeBtn.textContent = THEME_LABELS[currentTheme()];
themeBtn.addEventListener("click", () => {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  applyTheme(next);
});

$("btn-logout").addEventListener("click", () => {
  setMenuOpen(false);
  clearToken();
  section = "";
  sections = [];
  resetQuick();
  showLogin();
});

$("btn-review").addEventListener("click", () => showView("review"));
$("topic-review").addEventListener("click", () => showView("review", { sections: [section] }));
$("fab-add").addEventListener("click", () => openEditSheet(null));
for (const id of ["study-back", "topic-back", "review-back", "study-done-btn", "study-home-btn"]) {
  $(id).addEventListener("click", loadHome);
}
$("study-again-btn").addEventListener("click", loadStudy);

// ── Study ─────────────────────────────────────────────────────────────────────
let dueCards = [];
let currentIndex = 0;
let reviewedCount = 0;

const studyEl = {
  loading: $("study-loading"),
  empty: $("study-empty"),
  done: $("study-done"),
  area: $("flashcard-area"),
  progress: $("study-progress"),
  doneCount: $("study-done-count"),
  main: $("study-main"),
  ratings: $("rating-buttons"),
  speak: $("card-speak"),
  quiz: $("quiz-area"),
  notice: $("study-notice"),
};

const quiz = createQuiz(studyEl.quiz, {
  onProgress: (text) => (studyEl.progress.textContent = text),
  onFinish: ({ asked, correct }) => {
    studyEl.quiz.classList.add("hidden");
    showStudyDone();
    studyEl.doneCount.textContent = asked
      ? `Відповідей: ${asked}, правильних: ${correct}.`
      : "Квіз завершено без відповідей.";
  },
});

async function loadStudy() {
  showView("study");
  studyEl.main.querySelectorAll(".error-msg").forEach((el) => el.remove());
  studyEl.loading.classList.remove("hidden");
  for (const el of [studyEl.empty, studyEl.done, studyEl.area, studyEl.quiz, studyEl.notice]) {
    el.classList.add("hidden");
  }
  studyEl.progress.textContent = "";

  try {
    if (activity === "quiz") return await startQuiz();
    const p = new URLSearchParams({ direction });
    for (const s of studySections) p.append("section", s);
    const res = await apiFetch(`/vocabulary/due?${p}`);
    if (!res.ok) throw new Error();
    dueCards = shuffle(await res.json());
  } catch {
    studyEl.loading.classList.add("hidden");
    showErrorMsg(studyEl.main, "Не вдалося завантажити слова.");
    return;
  }
  studyEl.loading.classList.add("hidden");
  if (dueCards.length === 0) {
    studyEl.empty.classList.remove("hidden");
    return;
  }
  currentIndex = 0;
  reviewedCount = 0;
  showCard();
}

async function startQuiz() {
  const p = new URLSearchParams({ limit: "1000" });
  for (const s of studySections) p.append("section", s);
  const [deckRes, cardsRes] = await Promise.all([
    apiFetch("/vocabulary?limit=1000"),
    studySections.length ? apiFetch(`/vocabulary?${p}`) : null,
  ]);
  if (!deckRes.ok || (cardsRes && !cardsRes.ok)) throw new Error();
  const deck = (await deckRes.json()).words;
  const cards = cardsRes ? (await cardsRes.json()).words : deck;
  studyEl.loading.classList.add("hidden");
  if (deck.length < 4 || cards.length === 0) {
    studyEl.notice.textContent =
      deck.length < 4
        ? "Для квізу потрібно щонайменше 4 слова."
        : "У вибраних темах слів немає.";
    studyEl.notice.classList.remove("hidden");
    return;
  }
  studyEl.quiz.classList.remove("hidden");
  quiz.start({ cards, fullDeck: deck });
}

const flashcard = $("flashcard");
const cardWrap = $("card-wrap");
const isReverse = () => direction === "reverse";

function setText(id, text) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
}

function renderCardFaces(card) {
  const rev = isReverse();
  setText("front-lang", rev ? "Українська" : "English");
  $("front-main").textContent = rev ? shortMeaning(card) : card.word;
  $("front-main").lang = rev ? "uk" : "en";
  setText("front-sub", rev ? card.part_of_speech : card.transcription);
  setText("back-lang", rev ? "English" : "Українська");
  $("back-main").textContent = rev ? card.word : card.translation;
  $("back-main").lang = rev ? "en" : "uk";
  setText("back-ipa", rev ? card.transcription : "");
  setText("back-pos", rev ? "" : card.part_of_speech);
  const ex = exampleBlock(card);
  $("back-example").replaceChildren(...(ex ? ex.childNodes : []));
  setText("back-notes", card.notes);
}

function updateSpeaker() {
  const flipped = flashcard.classList.contains("flipped");
  // In UA → EN the English word is the answer, so its speaker waits for the flip.
  $("card-speak").classList.toggle("hidden", !canSpeak() || (isReverse() && !flipped));
}

function showCard() {
  const card = dueCards[currentIndex];
  const inner = flashcard.querySelector(".flashcard-card");
  inner.style.transition = "none"; // snap to front without showing the new answer mid-flip
  flashcard.classList.remove("flipped");
  void inner.offsetWidth;
  inner.style.transition = "";
  resetDrag();

  studyEl.progress.textContent = `${currentIndex + 1} / ${dueCards.length}`;
  renderCardFaces(card);
  studyEl.ratings.classList.add("hidden");
  studyEl.area.classList.remove("hidden");
  stopSpeaking();
  updateSpeaker();
  if (!isReverse() && getSettings().autoplay) speak(card.word);
}

function flipCard() {
  const flipped = flashcard.classList.toggle("flipped");
  studyEl.ratings.classList.toggle("hidden", !flipped);
  const card = dueCards[currentIndex];
  if (!card) return;
  updateSpeaker();
  if (flipped && getSettings().autoplay) {
    if (isReverse()) speakCard(card);
    else if (card.example) speak(card.example);
  }
}

flashcard.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    flipCard();
  }
});

studyEl.speak.addEventListener("click", () => {
  const card = dueCards[currentIndex];
  if (!card) return;
  if (flashcard.classList.contains("flipped") || isReverse()) speakCard(card);
  else speak(card.word);
});

// Tap flips; horizontal swipe: flipped → left = Again, right = Good; not flipped → reveal.
const SWIPE_THRESHOLD = 90;
let drag = null;
let suppressClick = false;

function resetDrag() {
  drag = null;
  cardWrap.classList.remove("dragging");
  cardWrap.style.transform = "";
  cardWrap.style.opacity = "";
}

flashcard.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
});
flashcard.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    drag.moved = true;
    cardWrap.classList.add("dragging");
    flashcard.setPointerCapture?.(e.pointerId);
  }
  if (drag.moved) {
    drag.dx = dx;
    cardWrap.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    cardWrap.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 500));
  }
});
async function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { dx, moved } = drag;
  resetDrag();
  if (!moved) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 50);
  if (Math.abs(dx) < SWIPE_THRESHOLD) return;
  if (!flashcard.classList.contains("flipped")) flipCard();
  else await rate(dx > 0 ? 4 : 0);
}
flashcard.addEventListener("pointerup", endDrag);
flashcard.addEventListener("pointercancel", resetDrag);
flashcard.addEventListener("click", () => {
  if (suppressClick || window.getSelection().toString()) return;
  flipCard();
});

async function rate(quality) {
  const card = dueCards[currentIndex];
  if (!card || !flashcard.classList.contains("flipped")) return;
  try {
    await apiFetch(`/vocabulary/${card.id}/review?direction=${direction}`, {
      method: "PATCH",
      body: JSON.stringify({ quality }),
    });
  } catch {
    // best effort: don't block studying on a network hiccup
  }
  reviewedCount++;
  currentIndex++;
  if (currentIndex >= dueCards.length) showStudyDone();
  else showCard();
}

studyEl.ratings.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-quality]");
  if (btn) rate(parseInt(btn.dataset.quality, 10));
});

function showStudyDone() {
  studyEl.area.classList.add("hidden");
  studyEl.done.classList.remove("hidden");
  const n = reviewedCount;
  studyEl.doneCount.textContent = n ? `Повторено слів: ${n}.` : "";
  studyEl.progress.textContent = "";
}

// ── Topic page ────────────────────────────────────────────────────────────────
const topicList = $("topic-list");
let topicTimer = null;
let topicWords = [];

$("topic-search").addEventListener("input", () => {
  clearTimeout(topicTimer);
  topicTimer = setTimeout(renderTopic, 250);
});

topicList.addEventListener("click", (e) => {
  const row = e.target.closest(".word-row");
  if (!row) return;
  const word = topicWords.find((w) => w.id === Number(row.dataset.id));
  if (!word) return;
  if (e.target.closest(".btn-speak")) speak(word.word);
  else openEditSheet(word);
});

async function openTopic(name) {
  section = name;
  const isAll = !name;
  $("topic-title").textContent = isAll ? "Усі слова" : name;
  $("topic-search").value = "";
  $("topic-review").classList.toggle("hidden", isAll);
  $("topic-rename").classList.toggle("hidden", isAll || name === FALLBACK_TOPIC);
  $("topic-actions").classList.toggle("hidden", isAll);
  await renderTopic();
  loadSections(); // keeps the rename merge hint and edit-sheet suggestions current
}

let topicReq = 0;
async function renderTopic() {
  const req = ++topicReq;
  topicList.replaceChildren(...skeletons(6, "skeleton-row"));
  $("topic-empty").classList.add("hidden");
  $("topic-count").textContent = "";
  const p = new URLSearchParams({ limit: "1000" });
  const q = $("topic-search").value.trim();
  if (q) p.set("q", q);
  if (section) p.append("section", section);
  try {
    const res = await apiFetch(`/vocabulary?${p}`);
    if (!res.ok) throw new Error();
    const words = (await res.json()).words;
    if (req !== topicReq) return;
    topicWords = words;
  } catch {
    if (req !== topicReq) return;
    topicList.replaceChildren();
    showErrorMsg(topicList, "Не вдалося завантажити слова.");
    return;
  }
  topicList.replaceChildren();
  if (topicWords.length === 0) return void $("topic-empty").classList.remove("hidden");
  $("topic-count").textContent = pluralWords(topicWords.length);
  topicList.append(...topicWords.map(buildWordRow));
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildWordRow(w) {
  const row = el("div", "word-row");
  row.dataset.id = w.id;
  const main = el("button", "word-main");
  main.type = "button";
  main.append(
    el("span", "word-title", w.word),
    el("span", "word-def", shortMeaning(w))
  );
  const speakBtn = el("button", "btn-icon btn-speak");
  speakBtn.type = "button";
  speakBtn.append(iconEl("speaker"));
  speakBtn.setAttribute("aria-label", `Прослухати ${w.word}`);
  row.append(main, speakBtn);
  return row;
}

// ── Rename topic ──────────────────────────────────────────────────────────────
const renameBackdrop = $("rename-sheet-backdrop");
const renameInput = $("rename-input");

function renameHint() {
  const v = renameInput.value.trim();
  const merge = v && v !== section && sections.some((s) => s.name === v);
  $("rename-hint").textContent = merge ? "Така тема вже є, слова об'єднаються." : "";
  $("rename-hint").classList.toggle("hidden", !merge);
}
renameInput.addEventListener("input", () => {
  $("rename-error").classList.add("hidden");
  renameHint();
});

function openRename() {
  renameInput.value = section;
  $("rename-error").classList.add("hidden");
  renameHint();
  renameBackdrop.setAttribute("aria-hidden", "false");
  renameBackdrop.classList.add("open");
  window.visualViewport?.addEventListener("resize", onViewportResize);
  renameInput.focus();
  renameInput.select();
}
function closeRename() {
  window.visualViewport?.removeEventListener("resize", onViewportResize);
  for (const b of [renameBackdrop, editBackdrop]) {
    b.style.height = "";
    b.style.top = "";
  }
  renameBackdrop.classList.remove("open");
  renameBackdrop.setAttribute("aria-hidden", "true");
}
function renameFail(msg) {
  $("rename-error").textContent = msg;
  $("rename-error").classList.remove("hidden");
}

$("topic-rename").addEventListener("click", openRename);
$("rename-cancel").addEventListener("click", closeRename);
renameBackdrop.addEventListener("click", (e) => {
  if (e.target === renameBackdrop) closeRename();
});
$("rename-sheet").addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = renameInput.value.trim();
  if (!next) return renameFail("Введи назву теми.");
  if (next === section) return closeRename();
  const btn = $("rename-save");
  btn.disabled = true;
  try {
    const res = await apiFetch(`/topics/${encodeURIComponent(section)}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) return renameFail(res.status === 404 ? "Такої теми вже немає." : "Не вдалося перейменувати.");
  } catch {
    return renameFail("Не вдалося перейменувати.");
  } finally {
    btn.disabled = false;
  }
  closeRename();
  $("topic-title").textContent = next;
  section = next;
  await loadSections();
  await renderTopic();
});

// ── Review picker ─────────────────────────────────────────────────────────────
let reviewSel = new Set();
const reviewList = $("review-list");

function bindSegmented(el, attr, get, set) {
  const sync = () =>
    el.querySelectorAll(".seg-btn").forEach((b) => {
      const on = b.dataset[attr] === get();
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  el.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    set(btn.dataset[attr]);
    sync();
  });
  sync();
}
bindSegmented($("activity-toggle"), "activity", () => activity, (v) => {
  activity = v;
  localStorage.setItem("lexi_activity", v);
  $("activity-desc").classList.toggle("hidden", v !== "quiz");
});
bindSegmented($("dir-toggle"), "dir", () => direction, (v) => {
  direction = v;
  localStorage.setItem("lexi_dir", v);
  renderReview();
});
$("activity-desc").classList.toggle("hidden", activity !== "quiz");

function syncAudioSettings() {
  $("autoplay-toggle").setAttribute("aria-checked", String(getSettings().autoplay));
  const problem = voiceProblem();
  $("voice-status").textContent = problem || "";
  $("voice-status").classList.toggle("hidden", !problem);
}
$("autoplay-toggle").addEventListener("click", () => {
  setSetting("autoplay", !getSettings().autoplay);
  syncAudioSettings();
});

async function openReview(preselect) {
  syncAudioSettings();
  reviewList.replaceChildren(...skeletons(4, "skeleton-row"));
  await loadSections();
  reviewSel = new Set(preselect ? preselect : sections.map((s) => s.name));
  renderReview();
}

function renderReview() {
  $("review-empty").classList.toggle("hidden", sections.length > 0);
  reviewList.replaceChildren(
    ...sections.map((s, i) => {
      const due = direction === "reverse" ? s.due_reverse : s.due;
      const label = el("label", "check-row");
      const box = el("input", "check-box");
      box.type = "checkbox";
      box.checked = reviewSel.has(s.name);
      box.addEventListener("change", () => {
        if (box.checked) reviewSel.add(s.name);
        else reviewSel.delete(s.name);
        syncReviewControls();
      });
      const text = el("span", "check-text");
      text.append(
        el("span", "check-name", s.name),
        el("span", "check-sub", due ? `${pluralWords(s.words)}, до повторення ${due}` : pluralWords(s.words))
      );
      label.append(box, text);
      return label;
    })
  );
  syncReviewControls();
}

function syncReviewControls() {
  const all = sections.length > 0 && sections.every((s) => reviewSel.has(s.name));
  $("review-toggle-all").textContent = all ? "Зняти всі" : "Вибрати всі";
  $("review-toggle-all").classList.toggle("hidden", sections.length < 2);
  $("review-start").disabled = !sections.some((s) => reviewSel.has(s.name));
}

$("review-toggle-all").addEventListener("click", () => {
  const all = sections.every((s) => reviewSel.has(s.name));
  reviewSel = new Set(all ? [] : sections.map((s) => s.name));
  renderReview();
});

$("review-start").addEventListener("click", () => {
  const chosen = sections.map((s) => s.name).filter((n) => reviewSel.has(n));
  studySections = chosen.length === sections.length ? [] : chosen;
  loadStudy();
});

// ── Add / edit sheet ──────────────────────────────────────────────────────────
const editBackdrop = $("edit-sheet-backdrop");
const FIELDS = {
  word: "edit-word",
  translation: "edit-translation",
  main_translation: "edit-main-translation",
  transcription: "edit-transcription",
  part_of_speech: "edit-pos",
  example: "edit-example",
  example_translation: "edit-example-translation",
  notes: "edit-notes",
  section: "edit-section",
};
let editing = null; // word object, or null when adding

function onViewportResize() {
  const vv = window.visualViewport;
  for (const b of [editBackdrop, renameBackdrop]) {
    b.style.height = `${vv.height}px`;
    b.style.top = `${vv.offsetTop}px`;
  }
}

function openEditSheet(word, focusField = "word") {
  editing = word;
  $("edit-title").textContent = word ? "Редагувати слово" : "Нове слово";
  $("edit-translation").placeholder = word ? "" : "Залиште порожнім — перекладу автоматично";
  for (const [key, id] of Object.entries(FIELDS)) {
    $(id).value = word ? word[key] || "" : key === "section" && section !== FALLBACK_TOPIC ? section : "";
  }
  $("edit-delete").classList.toggle("hidden", !word);
  $("edit-error").classList.add("hidden");
  editBackdrop.setAttribute("aria-hidden", "false");
  editBackdrop.classList.add("open");
  window.visualViewport?.addEventListener("resize", onViewportResize);
  const focusEl = $(FIELDS[focusField] || "edit-word");
  focusEl.focus();
  if (focusField === "section") focusEl.select();
}

function closeEditSheet() {
  window.visualViewport?.removeEventListener("resize", onViewportResize);
  editBackdrop.style.height = "";
  editBackdrop.style.top = "";
  editBackdrop.classList.remove("open");
  editBackdrop.setAttribute("aria-hidden", "true");
}

function editFail(msg) {
  const el = $("edit-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

// New word without a translation: translate it automatically (same flow as the home input),
// then apply the topic typed in the sheet, if any.
async function saveNewAuto(body) {
  const btn = $("edit-save");
  btn.disabled = true;
  btn.textContent = "Перекладаю…";
  try {
    const res = await apiFetch("/vocabulary/quick", { method: "POST", body: JSON.stringify({ text: body.word }) });
    if (!res.ok) return editFail("Не вдалося додати слово.");
    const r = await res.json();
    if (r.status === "not_english") return editFail("Це не схоже на англійське слово.");
    if (r.status === "unavailable") return editFail("Автопереклад зараз недоступний. Введіть переклад вручну.");
    if (r.status === "exists") return editFail(`«${r.word.word}» уже є у словнику.`);
    const extra = {};
    for (const key of ["transcription", "part_of_speech", "example", "example_translation", "notes", "section"]) {
      if (body[key]) extra[key] = body[key];
    }
    if (Object.keys(extra).length) {
      await apiFetch(`/vocabulary/${r.word.id}`, { method: "PATCH", body: JSON.stringify(extra) });
    }
    closeEditSheet();
    await refreshAfterEdit(null);
  } catch {
    editFail("Не вдалося додати слово.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Зберегти";
  }
}

// After a change, refresh whichever view is on screen.
async function refreshAfterEdit(updated) {
  if (!views.study.classList.contains("hidden") && dueCards[currentIndex] && updated) {
    Object.assign(dueCards[currentIndex], updated);
    renderCardFaces(dueCards[currentIndex]);
  } else if (!views.topic.classList.contains("hidden")) {
    await loadSections();
    await renderTopic();
  } else if (!views.home.classList.contains("hidden")) {
    if (quickWord && editing && editing.id === quickWord.id) {
      quickWord = updated ? { ...quickWord, ...updated } : null;
      quickState = quickWord ? { ...quickState, word: quickWord } : null;
      renderQuickResult();
    }
    await loadSections();
    renderTiles();
  }
}

$("edit-save").addEventListener("click", async () => {
  const body = {};
  for (const [key, id] of Object.entries(FIELDS)) body[key] = $(id).value.trim() || null;
  if (!body.word) return editFail("Введіть слово.");
  if (!editing && !body.translation) return saveNewAuto(body);
  if (!body.translation) return editFail("Введіть переклад.");
  const btn = $("edit-save");
  btn.disabled = true;
  btn.textContent = "Збереження…";
  try {
    const res = await apiFetch(editing ? `/vocabulary/${editing.id}` : "/vocabulary", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      closeEditSheet();
      await refreshAfterEdit(editing ? updated : null);
    } else if (res.status === 409) editFail("Таке слово вже є.");
    else editFail("Не вдалося зберегти.");
  } catch {
    editFail("Не вдалося зберегти.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Зберегти";
  }
});

$("edit-delete").addEventListener("click", async () => {
  if (!editing || !confirm(`Видалити «${editing.word}»?`)) return;
  try {
    const res = await apiFetch(`/vocabulary/${editing.id}`, { method: "DELETE" });
    if (!res.ok) return editFail("Не вдалося видалити.");
  } catch {
    return editFail("Не вдалося видалити.");
  }
  closeEditSheet();
  if (!views.study.classList.contains("hidden")) {
    dueCards.splice(currentIndex, 1);
    if (currentIndex >= dueCards.length) showStudyDone();
    else showCard();
  } else {
    await refreshAfterEdit(null);
  }
});

$("btn-edit-card").addEventListener("click", () => openEditSheet(dueCards[currentIndex]));
$("edit-cancel").addEventListener("click", closeEditSheet);
editBackdrop.addEventListener("click", (e) => {
  if (e.target === editBackdrop) closeEditSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (renameBackdrop.classList.contains("open")) closeRename();
  else if (editBackdrop.classList.contains("open")) closeEditSheet();
});

// ── Init ──────────────────────────────────────────────────────────────────────
if (getToken()) {
  $("view-login").classList.add("hidden");
  loadHome();
} else {
  showLogin();
}
