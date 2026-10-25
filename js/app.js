/* FocusFlow — Pomodoro timer + task list. Vanilla JS, state saved to localStorage. */
(() => {
  "use strict";

  // ---------- Storage ----------
  const STORE_KEY = "focusflow:v1";
  const DEFAULT_SETTINGS = { focus: 25, short: 5, long: 15, every: 4, sound: true, autostart: false };

  const MODES = {
    focus: { label: "Time to focus" },
    short: { label: "Take a short break" },
    long:  { label: "Enjoy a long break" },
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw) return raw;
    } catch (_) { /* storage blocked or corrupt — fall through to defaults */ }
    return null;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        tasks: state.tasks,
        settings: state.settings,
        history: state.history,
        selectedId: state.selectedId,
        theme: state.theme,
      }));
    } catch (_) { /* ignore — app still works for this session */ }
  }

  const saved = load() || {};
  const state = {
    tasks: saved.tasks || [],
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    history: saved.history || {},          // { "2026-10-25": 3, ... } completed focus sessions per day
    selectedId: saved.selectedId || null,
    theme: saved.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    filter: "all",
    mode: "focus",
    cycle: 0,                              // focus sessions completed toward the next long break
    running: false,
    endAt: 0,                              // timestamp the current run finishes
    remaining: 0,                          // ms left when paused
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    time: $("#timeDisplay"), modeLabel: $("#modeLabel"), ring: $("#ringProgress"),
    start: $("#startBtn"), reset: $("#resetBtn"), skip: $("#skipBtn"),
    tabs: document.querySelectorAll(".mode-tab"), dots: $("#sessionDots"),
    currentTask: $("#currentTask"),
    form: $("#taskForm"), input: $("#taskInput"), est: $("#taskEst"),
    list: $("#taskList"), empty: $("#emptyState"), count: $("#taskCount"),
    filters: document.querySelectorAll(".filter"), clearDone: $("#clearDone"),
    statToday: $("#statToday"), statMinutes: $("#statMinutes"), statStreak: $("#statStreak"),
    chart: $("#weekChart"), settings: $("#settingsForm"),
    themeToggle: $("#themeToggle"), toast: $("#toast"),
  };

  const RING_LEN = 2 * Math.PI * 96;
  el.ring.style.strokeDasharray = RING_LEN;

  // ---------- Helpers ----------
  const uid = () => Math.random().toString(36).slice(2, 10);
  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const durationOf = (mode) => state.settings[mode] * 60 * 1000;

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2400);
  }

  function chime() {
    if (!state.settings.sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 990].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (_) { /* audio unavailable */ }
  }

  // ---------- Timer ----------
  let ticker = null;

  function setMode(mode, { keepRunning = false } = {}) {
    state.mode = mode;
    state.remaining = durationOf(mode);
    document.body.dataset.mode = mode;
    el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    el.modeLabel.textContent = MODES[mode].label;
    if (keepRunning) start(); else pause();
    renderTimer();
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.endAt = Date.now() + state.remaining;
    el.start.textContent = "Pause";
    ticker = setInterval(tick, 250);
    tick();
  }

  function pause() {
    if (state.running) state.remaining = Math.max(0, state.endAt - Date.now());
    state.running = false;
    clearInterval(ticker);
    el.start.textContent = state.remaining < durationOf(state.mode) ? "Resume" : "Start";
  }

  function reset() {
    pause();
    state.remaining = durationOf(state.mode);
    el.start.textContent = "Start";
    renderTimer();
  }

  function tick() {
    state.remaining = Math.max(0, state.endAt - Date.now());
    renderTimer();
    if (state.remaining <= 0) complete();
  }

  function complete({ skipped = false } = {}) {
    pause();
    if (state.mode === "focus" && !skipped) {
      const today = dayKey();
      state.history[today] = (state.history[today] || 0) + 1;
      state.cycle += 1;
      const task = state.tasks.find((t) => t.id === state.selectedId);
      if (task) task.pomos += 1;
      chime();
      toast(task ? `Nice! +1 pomodoro on "${task.title}"` : "Focus session complete 🎉");
      save();
      renderTasks();
      renderStats();
    } else if (!skipped) {
      chime();
      toast("Break's over — back to it 💪");
    }

    let next = "focus";
    if (state.mode === "focus") {
      next = !skipped && state.cycle % state.settings.every === 0 ? "long" : "short";
    }
    setMode(next, { keepRunning: state.settings.autostart && !skipped });
    renderDots();
  }

  function renderTimer() {
    const total = durationOf(state.mode);
    const text = fmt(state.remaining);
    el.time.textContent = text;
    el.ring.style.strokeDashoffset = RING_LEN * (1 - state.remaining / total);
    document.title = `${text} · ${state.mode === "focus" ? "Focus" : "Break"} — FocusFlow`;
  }

  function renderDots() {
    const n = state.settings.every;
    const filled = state.cycle % n || (state.cycle > 0 && state.mode === "long" ? n : 0);
    el.dots.innerHTML = Array.from({ length: n }, (_, i) =>
      `<span class="dot${i < filled ? " filled" : ""}"></span>`).join("");
  }

  // ---------- Tasks ----------
  function addTask(title, est) {
    const task = { id: uid(), title, est, pomos: 0, done: false };
    state.tasks.push(task);
    if (!state.selectedId) state.selectedId = task.id;
    save();
    renderTasks();
  }

  function visibleTasks() {
    if (state.filter === "active") return state.tasks.filter((t) => !t.done);
    if (state.filter === "done") return state.tasks.filter((t) => t.done);
    return state.tasks;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderTasks() {
    const tasks = visibleTasks();
    el.list.innerHTML = tasks.map((t) => `
      <li class="task${t.done ? " done" : ""}${t.id === state.selectedId ? " selected" : ""}" data-id="${t.id}" draggable="true">
        <span class="handle" aria-hidden="true">⋮⋮</span>
        <input type="checkbox" class="check" ${t.done ? "checked" : ""} aria-label="Mark done">
        <span class="task-title" title="Click to focus on this task">${escapeHtml(t.title)}</span>
        <span class="task-count">${t.pomos}/${t.est} 🍅</span>
        <button class="del" aria-label="Delete task">×</button>
      </li>`).join("");

    el.empty.classList.toggle("show", tasks.length === 0);
    const left = state.tasks.filter((t) => !t.done).length;
    el.count.textContent = `${left} left`;

    const current = state.tasks.find((t) => t.id === state.selectedId);
    el.currentTask.textContent = current ? current.title : "Pick a task from the list";
  }

  el.list.addEventListener("click", (e) => {
    const li = e.target.closest(".task");
    if (!li) return;
    const task = state.tasks.find((t) => t.id === li.dataset.id);

    if (e.target.matches(".check")) {
      task.done = e.target.checked;
      if (task.done) toast(`Completed "${task.title}" ✅`);
    } else if (e.target.matches(".del")) {
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      if (state.selectedId === task.id) state.selectedId = null;
    } else {
      state.selectedId = task.id;
    }
    save();
    renderTasks();
  });

  // Drag & drop reordering
  let dragId = null;
  el.list.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".task");
    dragId = li.dataset.id;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  el.list.addEventListener("dragend", (e) => {
    e.target.closest(".task")?.classList.remove("dragging");
    el.list.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
  });
  el.list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const li = e.target.closest(".task");
    el.list.querySelectorAll(".drag-over").forEach((n) => n !== li && n.classList.remove("drag-over"));
    if (li && li.dataset.id !== dragId) li.classList.add("drag-over");
  });
  el.list.addEventListener("drop", (e) => {
    e.preventDefault();
    const li = e.target.closest(".task");
    if (!li || !dragId || li.dataset.id === dragId) return;
    const from = state.tasks.findIndex((t) => t.id === dragId);
    const [moved] = state.tasks.splice(from, 1);
    const to = state.tasks.findIndex((t) => t.id === li.dataset.id);
    state.tasks.splice(to, 0, moved);
    save();
    renderTasks();
  });

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = el.input.value.trim();
    if (!title) return;
    addTask(title, Math.min(12, Math.max(1, parseInt(el.est.value, 10) || 1)));
    el.input.value = "";
    el.est.value = 1;
  });

  el.filters.forEach((btn) => btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter;
    el.filters.forEach((b) => b.classList.toggle("active", b === btn));
    renderTasks();
  }));

  el.clearDone.addEventListener("click", () => {
    const n = state.tasks.filter((t) => t.done).length;
    if (!n) return toast("Nothing to clear");
    state.tasks = state.tasks.filter((t) => !t.done);
    if (!state.tasks.some((t) => t.id === state.selectedId)) state.selectedId = null;
    save();
    renderTasks();
    toast(`Cleared ${n} finished task${n > 1 ? "s" : ""}`);
  });

  // ---------- Stats ----------
  function renderStats() {
    const today = new Date();
    const todayCount = state.history[dayKey(today)] || 0;

    // Week starting Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { d, count: state.history[dayKey(d)] || 0 };
    });
    const weekTotal = days.reduce((s, x) => s + x.count, 0);
    const max = Math.max(4, ...days.map((x) => x.count));

    // Streak: consecutive days with ≥1 session, counting back from today (or yesterday if today is empty)
    let streak = 0;
    const cursor = new Date(today);
    if (!todayCount) cursor.setDate(cursor.getDate() - 1);
    while (state.history[dayKey(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    el.statToday.textContent = todayCount;
    el.statMinutes.textContent = weekTotal * state.settings.focus;
    el.statStreak.textContent = streak;

    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    el.chart.innerHTML = days.map((x, i) => `
      <div class="bar-col${dayKey(x.d) === dayKey(today) ? " today" : ""}">
        <div class="bar-track">
          <span class="bar-val">${x.count || ""}</span>
          <div class="bar" style="height:${(x.count / max) * 100}%"></div>
        </div>
        <span class="bar-day">${names[i]}</span>
      </div>`).join("");
  }

  // ---------- Settings ----------
  function renderSettings() {
    const f = el.settings.elements;
    ["focus", "short", "long", "every"].forEach((k) => (f[k].value = state.settings[k]));
    f.sound.checked = state.settings.sound;
    f.autostart.checked = state.settings.autostart;
  }

  el.settings.addEventListener("change", (e) => {
    const { name, type, checked, value, min, max } = e.target;
    if (type === "checkbox") {
      state.settings[name] = checked;
    } else {
      const v = Math.min(+max, Math.max(+min, parseInt(value, 10) || +min));
      state.settings[name] = v;
      e.target.value = v;
      if (name === state.mode && !state.running) reset();
      if (name === "every") renderDots();
      if (name === "focus") renderStats();
    }
    save();
  });

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }
  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    save();
  }
  el.themeToggle.addEventListener("click", toggleTheme);

  // ---------- Controls & shortcuts ----------
  el.start.addEventListener("click", () => (state.running ? pause() : start()));
  el.reset.addEventListener("click", reset);
  el.skip.addEventListener("click", () => complete({ skipped: true }));
  el.tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === " ") { e.preventDefault(); state.running ? pause() : start(); }
    else if (key === "r") reset();
    else if (key === "s") complete({ skipped: true });
    else if (key === "n") { e.preventDefault(); el.input.focus(); }
    else if (key === "t") toggleTheme();
  });

  // ---------- Demo data (open index.html?demo) ----------
  function seedDemo() {
    const make = (title, est, pomos, done = false) => ({ id: uid(), title, est, pomos, done });
    state.tasks = [
      make("Design landing page hero", 3, 2),
      make("Write project README", 2, 1),
      make("Fix mobile nav bug", 1, 1, true),
      make("Review pull requests", 2, 0),
      make("Plan next sprint", 1, 0),
    ];
    state.selectedId = state.tasks[0].id;
    const counts = [4, 6, 3, 7, 5, 2, 3];
    const today = new Date();
    const dow = (today.getDay() + 6) % 7;
    state.history = {};
    for (let i = 0; i <= dow + 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      state.history[dayKey(d)] = counts[(dow - i + 14) % 7];
    }
  }

  // ---------- Init ----------
  const params = new URLSearchParams(location.search);
  if (params.has("demo")) seedDemo();
  if (["light", "dark"].includes(params.get("theme"))) state.theme = params.get("theme");

  applyTheme();
  renderSettings();
  setMode("focus");
  renderDots();
  renderTasks();
  renderStats();
})();
