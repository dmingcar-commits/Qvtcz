const STATE_KEY = "t3p_quiz_state_v2";

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
};

const loadState = () => {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); }
  catch { return {}; }
};
const saveState = (partial) => {
  const prev = loadState();
  localStorage.setItem(STATE_KEY, JSON.stringify({ ...prev, ...partial }));
};
const resetState = () => localStorage.removeItem(STATE_KEY);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let db = [];
let categories = [];
let activeCategory = null;
let groups = [];

let current = {
  category: null,
  group: null,
  order: [],
  index: 0,
  selected: null,
  validated: false,
  score: 0,
  mistakes: []
};

function show(viewId) {
  ["#viewHome", "#viewQuiz", "#viewResults"].forEach(v => $(v).classList.add("hidden"));
  $(viewId).classList.remove("hidden");
}

function computeCategories() {
  const set = new Set(db.map(x => x.category));
  // Ordre PRO
  const order = [
    "Tronc commun • Réglementation",
    "Spécifique VTC",
    "Gestion",
    "Sécurité routière",
    "Anglais"
  ];
  const rest = [...set].filter(x => !order.includes(x)).sort();
  categories = [...order.filter(x => set.has(x)), ...rest];
  activeCategory = activeCategory || categories[0] || null;
}

function computeGroups() {
  const map = new Map(); // group -> items
  for (const item of db.filter(x => x.category === activeCategory)) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group).push(item);
  }
  groups = [...map.entries()].map(([name, items]) => ({ name, count: items.length }));
}

function renderCategoryTabs() {
  const tabs = $("#categoryTabs");
  tabs.innerHTML = "";
  for (const c of categories) {
    const btn = el("button", {
      class: "tab" + (c === activeCategory ? " active" : ""),
      type: "button",
      onClick: () => {
        activeCategory = c;
        renderCategoryTabs();
        renderGroups();
      }
    }, [c]);
    tabs.append(btn);
  }
}

function groupKey(cat, group) {
  return `${cat}|||${group}`;
}

function getProgress() {
  const state = loadState();
  return state.progress || {}; // { [cat|||group]: { bestScore, attempts } }
}

function setProgress(cat, group, pct) {
  const state = loadState();
  const progress = state.progress || {};
  const k = groupKey(cat, group);
  const prev = progress[k] || { bestScore: 0, attempts: 0 };
  progress[k] = { bestScore: Math.max(prev.bestScore, pct), attempts: prev.attempts + 1 };
  saveState({ progress });
}

function renderGroups() {
  computeGroups();
  const progress = getProgress();
  const q = ($("#search").value || "").trim().toLowerCase();
  const onlyWeak = $("#onlyWeak").checked;

  let view = groups
    .filter(g => !q || g.name.toLowerCase().includes(q))
    .map(g => {
      const p = progress[groupKey(activeCategory, g.name)] || { bestScore: 0, attempts: 0 };
      return { ...g, bestScore: p.bestScore, attempts: p.attempts };
    });

  if (onlyWeak) {
    view = view.sort((a, b) => (a.bestScore - b.bestScore) || (b.count - a.count));
  } else {
    view = view.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  const wrap = $("#groups");
  wrap.innerHTML = "";

  for (const g of view) {
    const tile = el("div", { class: "group-tile", onClick: () => startGroup(activeCategory, g.name) }, [
      el("div", { class: "group-name" }, [g.name]),
      el("div", { class: "group-meta" }, [
        el("span", {}, [`${g.count} questions`]),
        el("span", { class: "pill" }, [`Best: ${g.bestScore}% • Try: ${g.attempts}`]),
      ])
    ]);
    wrap.append(tile);
  }

  if (view.length === 0) {
    wrap.append(el("div", { class: "result-item" }, ["Aucun groupe trouvé. Essaie un autre mot-clé."]));
  }
}

function startGroup(category, groupName) {
  const items = db.filter(x => x.category === category && x.group === groupName);
  const order = shuffle(items.map(x => x.id));

  current = {
    category,
    group: groupName,
    order,
    index: 0,
    selected: null,
    validated: false,
    score: 0,
    mistakes: []
  };

  show("#viewQuiz");
  renderQuestion();
}

function getCurrentItem() {
  const id = current.order[current.index];
  return db.find(x => x.id === id);
}

function renderQuestion() {
  const item = getCurrentItem();

  $("#quizTitle").textContent = `${current.category} — ${current.group}`;
  $("#quizMeta").textContent = `Question ${current.index + 1}/${current.order.length}`;

  const pct = Math.round((current.index / current.order.length) * 100);
  $("#progressBar").style.width = `${pct}%`;

  $("#questionBox").textContent = item.q;

  const answers = $("#answersBox");
  answers.innerHTML = "";

  item.options.forEach((opt, idx) => {
    const node = el("div", {
      class: "answer",
      onClick: () => {
        if (current.validated) return;
        current.selected = idx;
        $("#btnValidate").disabled = false;
        [...answers.children].forEach(c => c.classList.remove("selected"));
        node.classList.add("selected");
      }
    }, [opt]);
    answers.append(node);
  });

  $("#btnValidate").disabled = true;
  $("#btnNext").disabled = true;
  current.selected = null;
  current.validated = false;
  $("#feedback").classList.add("hidden");
  $("#feedback").textContent = "";
}

function validate() {
  if (current.selected === null) return;

  const item = getCurrentItem();
  current.validated = true;

  const answers = [...$("#answersBox").children];
  answers.forEach((node, idx) => {
    node.classList.remove("selected");
    if (idx === item.answerIndex) node.classList.add("correct");
    if (idx === current.selected && idx !== item.answerIndex) node.classList.add("wrong");
  });

  const ok = current.selected === item.answerIndex;
  if (ok) current.score += 1;
  else current.mistakes.push({ ...item, chosen: current.selected });

  const fb = $("#feedback");
  fb.classList.remove("hidden");
  fb.textContent = ok
    ? "✅ Correct."
    : `❌ Incorrect. Bonne réponse : ${item.options[item.answerIndex]}${item.explanation ? " — " + item.explanation : ""}`;

  $("#btnNext").disabled = false;
  $("#btnValidate").disabled = true;
}

function next() {
  if (!current.validated) return;

  current.index += 1;
  if (current.index >= current.order.length) {
    return finish();
  }
  renderQuestion();
}

function finish() {
  const total = current.order.length;
  const pct = Math.round((current.score / total) * 100);
  $("#progressBar").style.width = `100%`;

  setProgress(current.category, current.group, pct);

  $("#resultsText").textContent = `Score : ${current.score}/${total} (${pct}%).`;
  const list = $("#resultsList");
  list.innerHTML = "";

  if (current.mistakes.length === 0) {
    list.append(el("div", { class: "result-item" }, ["Aucune erreur. Niveau excellent."]));
  } else {
    current.mistakes.forEach(m => {
      list.append(el("div", { class: "result-item" }, [
        el("div", { style: "font-weight:900; margin-bottom:6px" }, [m.q]),
        el("div", { class: "muted" }, [`Ta réponse : ${m.options[m.chosen]}`]),
        el("div", { class: "muted" }, [`Bonne réponse : ${m.options[m.answerIndex]}`]),
      ]));
    });
  }

  show("#viewResults");
}

function reviewMistakes() {
  if (current.mistakes.length === 0) return;
  current.order = current.mistakes.map(m => m.id);
  current.index = 0;
  current.score = 0;
  current.mistakes = [];
  show("#viewQuiz");
  renderQuestion();
}

async function init() {
  // Repo link (optional): set your repo URL here after you create it
  $("#btnRepo").href = "https://github.com/";

  const files = [
    "data/tronc_commun.reglementation.json",
    "data/vtc.specifique.json",
    "data/gestion.json",
    "data/securite.json",
    "data/anglais.json"
  ];

  const all = await Promise.all(files.map(f => fetch(f, { cache: "no-store" }).then(r => r.json())));
  db = all.flat();

  computeCategories();
  renderCategoryTabs();
  renderGroups();

  $("#btnValidate").addEventListener("click", validate);
  $("#btnNext").addEventListener("click", next);
  $("#btnBack").addEventListener("click", () => show("#viewHome"));
  $("#btnHome").addEventListener("click", () => show("#viewHome"));
  $("#btnRestart").addEventListener("click", () => startGroup(current.category, current.group));
  $("#btnReview").addEventListener("click", reviewMistakes);

  $("#btnReset").addEventListener("click", () => {
    resetState();
    renderGroups();
    show("#viewHome");
  });

  $("#search").addEventListener("input", renderGroups);
  $("#onlyWeak").addEventListener("change", renderGroups);

  show("#viewHome");
}

init();
