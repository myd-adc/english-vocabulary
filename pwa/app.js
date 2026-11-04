import { createQuiz, exampleBlock } from "./quiz.js";
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
const views = { home: $("view-home"), study: $("view-study"), browse: $("view-browse") };
function showView(name, opts = {}) {
  // Hooks for the topic page and the review picker (Task 5). Until those views exist,
  // fall back to the browse list and the study session so nothing is unreachable.
  if (name === "topic" && !views.topic) return void loadBrowse(opts.name || "");
  if (name === "review" && !views.review) return void loadStudy();
  stopSpeaking();
  quiz.stop();
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
  window.scrollTo(0, 0);
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
let section = ""; // "" = all sections
let sections = [];

const isDifficult = (w) =>
  w.ease_factor < 2.1 || w.reverse_ease_factor < 2.1 || w.lapses >= 2 || w.reverse_lapses >= 2;

function fillSectionSelect(select, withAll = true) {
  const current = select.value;
  select.replaceChildren();
  if (withAll) select.append(new Option("Усі теми", ""));
  for (const s of sections) select.append(new Option(`${s.name} (${s.words})`, s.name));
  select.value = sections.some((s) => s.name === current) ? current : "";
}

async function loadSections() {
  try {
    const res = await apiFetch("/sections");
    if (!res.ok) return;
    sections = await res.json();
    if (section && !sections.some((s) => s.name === section)) section = "";
    $("section-options").replaceChildren(...sections.map((s) => new Option(s.name)));
  } catch {
    // offline — keep what we have
  }
}

async function loadHome() {
  showView("home");
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
  if (word.section) meta.append(mk("span", "chip", word.section));
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

$("quick-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = quickInput.value.trim();
  if (quickBusy || !text) return;
  setQuickBusy(true);
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
    quickState.error = err.message || "Не вдалося зберегти.";
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
  if (open) appMenu.querySelector("[role=menuitem]").focus();
}
menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenuOpen(appMenu.classList.contains("hidden"));
});
document.addEventListener("click", (e) => {
  if (!appMenu.classList.contains("hidden") && !appMenu.contains(e.target)) setMenuOpen(false);
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
$("fab-add").addEventListener("click", () => openEditSheet(null));
for (const id of ["study-back", "browse-back", "study-done-btn", "study-home-btn"]) {
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
    if (section) p.set("section", section);
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
  const res = await apiFetch("/vocabulary?limit=1000");
  if (!res.ok) throw new Error();
  const deck = (await res.json()).words;
  studyEl.loading.classList.add("hidden");
  const cards = deck.filter((c) => !section || c.section === section);
  if (deck.length < 4 || cards.length === 0) {
    studyEl.notice.textContent =
      deck.length < 4
        ? "Для квізу потрібно щонайменше 4 слова."
        : "У цьому розділі слів немає.";
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
  $("front-main").textContent = rev ? card.translation : card.word;
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

// ── Browse ────────────────────────────────────────────────────────────────────
const browseList = $("browse-list");
let browseTimer = null;

$("browse-search").addEventListener("input", () => {
  clearTimeout(browseTimer);
  browseTimer = setTimeout(renderBrowse, 250);
});
$("browse-section").addEventListener("change", renderBrowse);
$("browse-filter").addEventListener("change", renderBrowse);

browseList.addEventListener("click", (e) => {
  const item = e.target.closest(".word-item");
  if (!item) return;
  const word = browseWords.find((w) => w.id === Number(item.dataset.id));
  if (e.target.closest(".btn-speak")) return void speak(word.word);
  if (e.target.closest(".btn-edit")) return void openEditSheet(word);
  if (e.target.closest(".word-summary")) item.classList.toggle("expanded");
});

let browseWords = [];

async function loadBrowse(name = "") {
  section = name;
  showView("browse");
  await loadSections();
  fillSectionSelect($("browse-section"));
  $("browse-section").value = section;
  await renderBrowse();
}

async function renderBrowse() {
  browseList.replaceChildren();
  $("browse-loading").classList.remove("hidden");
  $("browse-empty").classList.add("hidden");
  const p = new URLSearchParams({ limit: "1000" });
  const q = $("browse-search").value.trim();
  if (q) p.set("q", q);
  if ($("browse-section").value) p.set("section", $("browse-section").value);
  const filter = $("browse-filter").value;
  if (filter === "due") p.set("due", direction);
  if (filter === "difficult") p.set("difficult", "true");
  try {
    const res = await apiFetch(`/vocabulary?${p}`);
    if (!res.ok) throw new Error();
    browseWords = (await res.json()).words;
  } catch {
    $("browse-loading").classList.add("hidden");
    showErrorMsg(browseList, "Не вдалося завантажити слова.");
    return;
  }
  $("browse-loading").classList.add("hidden");
  if (browseWords.length === 0) return void $("browse-empty").classList.remove("hidden");

  const groups = new Map();
  for (const w of browseWords) {
    const key = w.section || "Без розділу";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  const frag = document.createDocumentFragment();
  for (const [name, words] of groups) {
    const group = document.createElement("div");
    group.className = "lang-group";
    const heading = document.createElement("div");
    heading.className = "lang-heading";
    heading.textContent = `${name} · ${words.length}`;
    group.appendChild(heading);
    for (const w of words) group.appendChild(buildWordItem(w));
    frag.appendChild(group);
  }
  browseList.appendChild(frag);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildWordItem(w) {
  const item = el("div", "word-item");
  item.dataset.id = w.id;

  const title = el("div", "word-title", w.word);
  if (isDifficult(w)) title.append(el("span", "badge-hard", "складне"));
  const text = el("div", "word-text");
  text.append(title, el("div", "word-def", w.translation));

  const summary = el("div", "word-summary");
  summary.append(text);
  const speakBtn = el("button", "btn-icon btn-speak");
  speakBtn.append(iconEl("speaker"));
  speakBtn.type = "button";
  speakBtn.setAttribute("aria-label", `Прослухати ${w.word}`);
  summary.append(speakBtn, el("span", "word-due", w.next_review), (() => { const c = el("span", "word-expand-icon"); c.append(iconEl("chevron-down")); return c; })());

  const detail = el("div", "word-detail");
  const meta = [w.transcription, w.part_of_speech].filter(Boolean).join(" · ");
  if (meta) detail.append(el("div", "word-stats", meta));
  const ex = exampleBlock(w);
  if (ex) {
    ex.style.textAlign = "left";
    detail.append(ex);
  }
  if (w.notes) detail.append(el("div", "card-notes", w.notes));
  detail.append(
    el(
      "div",
      "word-stats",
      `EN–UA: ease ${w.ease_factor.toFixed(2)}, помилок ${w.lapses}. UA–EN: ease ${w.reverse_ease_factor.toFixed(2)}, помилок ${w.reverse_lapses}.`
    )
  );
  const actions = el("div", "word-actions");
  const edit = el("button", "btn-edit", "Редагувати");
  edit.type = "button";
  actions.append(edit);
  detail.append(actions);

  item.append(summary, detail);
  return item;
}

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
  editBackdrop.style.height = `${vv.height}px`;
  editBackdrop.style.top = `${vv.offsetTop}px`;
}

function openEditSheet(word) {
  editing = word;
  $("edit-title").textContent = word ? "Редагувати слово" : "Нове слово";
  for (const [key, id] of Object.entries(FIELDS)) {
    $(id).value = word ? word[key] || "" : key === "section" ? section : "";
  }
  $("edit-delete").classList.toggle("hidden", !word);
  $("edit-error").classList.add("hidden");
  editBackdrop.setAttribute("aria-hidden", "false");
  editBackdrop.classList.add("open");
  window.visualViewport?.addEventListener("resize", onViewportResize);
  $("edit-word").focus();
}

function closeEditSheet() {
  window.visualViewport?.removeEventListener("resize", onViewportResize);
  editBackdrop.style.height = "";
  editBackdrop.style.top = "";
  editBackdrop.classList.remove("open");
  editBackdrop.setAttribute("aria-hidden", "true");
}

function editFail(msg) {
  $("edit-error").textContent = msg;
  $("edit-error").classList.remove("hidden");
}

// After a change, refresh whichever view is on screen.
async function refreshAfterEdit(updated) {
  if (!views.study.classList.contains("hidden") && dueCards[currentIndex] && updated) {
    Object.assign(dueCards[currentIndex], updated);
    renderCardFaces(dueCards[currentIndex]);
  } else if (!views.browse.classList.contains("hidden")) {
    await loadSections();
    fillSectionSelect($("browse-section"));
    await renderBrowse();
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
  if (!body.word || !body.translation) return editFail("Слово й переклад обов'язкові.");
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
  if (e.key === "Escape" && editBackdrop.classList.contains("open")) closeEditSheet();
});

// ── Init ──────────────────────────────────────────────────────────────────────
if (getToken()) {
  $("view-login").classList.add("hidden");
  loadHome();
} else {
  showLogin();
}
