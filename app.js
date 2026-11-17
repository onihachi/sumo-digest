const els = {
  bashoLabel: document.querySelector("#basho-label"),
  dateLabel: document.querySelector("#date-label"),
  countLabel: document.querySelector("#count-label"),
  daySelect: document.querySelector("#day-select"),
  currentNumber: document.querySelector("#current-number"),
  totalNumber: document.querySelector("#total-number"),
  statusPill: document.querySelector("#status-pill"),
  player: document.querySelector("#video-player"),
  emptyState: document.querySelector("#empty-state"),
  emptyKicker: document.querySelector("#empty-kicker"),
  emptyTitleCurrent: document.querySelector("#empty-title-current"),
  emptyTitleArchive: document.querySelector("#empty-title-archive"),
  emptyDescriptionCurrent: document.querySelector("#empty-description-current"),
  emptyDescriptionArchive: document.querySelector("#empty-description-archive"),
  boutInfo: document.querySelector("#bout-info"),
  boutEyebrow: document.querySelector("#bout-eyebrow"),
  boutTitle: document.querySelector("#bout-title"),
  progressBar: document.querySelector("#progress-bar"),
  previousButton: document.querySelector("#previous-button"),
  nextButton: document.querySelector("#next-button"),
  viewerShell: document.querySelector(".viewer-shell"),
  archiveSection: document.querySelector("#archive-section"),
  archiveList: document.querySelector("#archive-list"),
  currentTournamentButton: document.querySelector("#current-tournament-button"),
  updatedLabel: document.querySelector("#updated-label"),
};

const state = {
  data: null,
  archiveData: null,
  archiveTournaments: [],
  tournament: null,
  activeArchiveId: null,
  days: [],
  selectedDay: null,
  currentIndex: 0,
};

const DAY_NAMES = { 1: "初日", 8: "中日", 15: "千秋楽" };

function tokyoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function todayInTokyo() {
  const { year, month, day } = tokyoDateParts();
  return `${year}-${month}-${day}`;
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

function dateForDay(start, day) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

function displayDayName(day) {
  return DAY_NAMES[day] || `${day}日目`;
}

function displayDate(value, includeYear = false) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00Z`));
}

function withTodayPlaceholder(data) {
  const days = [...data.tournament.days];
  const offset = daysBetween(data.tournament.startDate, todayInTokyo());
  const dayNumber = offset + 1;

  if (dayNumber >= 1 && dayNumber <= 15 && !days.some((item) => item.day === dayNumber)) {
    days.push({
      day: dayNumber,
      date: dateForDay(data.tournament.startDate, dayNumber),
      complete: false,
      videos: [],
    });
  }

  return days.sort((a, b) => a.day - b.day);
}

function buildDayPicker() {
  els.daySelect.replaceChildren();

  for (const day of [...state.days].reverse()) {
    const option = document.createElement("option");
    option.value = String(day.day);
    option.textContent = displayDayName(day.day);
    els.daySelect.append(option);
  }
}

function latestDay(tournament) {
  return [...(tournament?.days || [])].sort((a, b) => a.day - b.day).at(-1);
}

function latestArchiveDay(tournament) {
  return [...(tournament?.days || [])].sort((a, b) => b.day - a.day)
    .find((day) => day.videos.length) || latestDay(tournament);
}

function latestCurrentDayWithVideos() {
  return [...state.days].reverse().find((item) => item.videos.length) || state.days.at(-1);
}

function updateUpdatedLabel() {
  const generatedAt = state.activeArchiveId
    ? state.archiveData?.generatedAt
    : state.data?.generatedAt;
  const prefix = state.activeArchiveId ? "アーカイブ更新" : "最終更新";
  if (!generatedAt) {
    els.updatedLabel.textContent = state.activeArchiveId ? "アーカイブ収録" : "最終更新を確認中";
    return;
  }

  els.updatedLabel.textContent = `${prefix} ${new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(generatedAt))}`;
}

function renderArchiveList() {
  els.archiveList.replaceChildren();

  for (const tournament of state.archiveTournaments) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const label = document.createElement("span");
    const summary = document.createElement("small");
    const lastDay = latestArchiveDay(tournament);

    button.className = "archive-button";
    button.type = "button";
    button.dataset.archiveId = tournament.id;
    label.className = "archive-card-label";
    label.textContent = tournament.displayLabel;
    summary.className = "archive-card-summary";
    summary.textContent = lastDay
      ? `${displayDayName(lastDay.day)}・${lastDay.videos.length}取組`
      : "収録データなし";
    button.append(label, summary);
    item.append(button);
    els.archiveList.append(item);
  }

  updateArchiveSelection();
}

function updateArchiveSelection() {
  els.archiveSection.hidden = state.archiveTournaments.length === 0;
  for (const item of els.archiveList.children) {
    const button = item.children[0];
    if (button?.dataset.archiveId) {
      button.setAttribute("aria-pressed", String(state.activeArchiveId === button.dataset.archiveId));
    }
  }
  els.currentTournamentButton.hidden = !state.activeArchiveId;
}

function setTournament(tournament, archiveId = null) {
  state.tournament = tournament;
  state.activeArchiveId = archiveId;
  state.days = archiveId
    ? [...tournament.days].sort((a, b) => a.day - b.day)
    : withTodayPlaceholder(state.data);
  els.bashoLabel.textContent = tournament.label;
  buildDayPicker();
  updateArchiveSelection();
  updateUpdatedLabel();
}

function selectedVideos() {
  return state.selectedDay?.videos || [];
}

function updateEmptyStateCopy() {
  const isArchive = Boolean(state.activeArchiveId);
  els.emptyKicker.textContent = isArchive ? "収録なし" : "ただいま準備中";
  els.emptyTitleCurrent.hidden = isArchive;
  els.emptyTitleArchive.hidden = !isArchive;
  els.emptyDescriptionCurrent.hidden = isArchive;
  els.emptyDescriptionArchive.hidden = !isArchive;
}

function updateVideo({ autoplay = false } = {}) {
  const videos = selectedVideos();
  const video = videos[state.currentIndex];
  const hasVideo = Boolean(video);
  const isLastVideo = hasVideo && state.currentIndex === videos.length - 1;
  const finalBoutVerified = !state.activeArchiveId || state.selectedDay?.complete;

  els.player.hidden = !hasVideo;
  els.emptyState.hidden = hasVideo;
  els.boutInfo.hidden = !hasVideo;
  els.currentNumber.textContent = hasVideo ? String(state.currentIndex + 1).padStart(2, "0") : "—";
  els.totalNumber.textContent = videos.length ? String(videos.length).padStart(2, "0") : "—";
  els.progressBar.style.width = hasVideo ? `${((state.currentIndex + 1) / videos.length) * 100}%` : "0%";
  updateEmptyStateCopy();

  if (hasVideo) {
    const params = new URLSearchParams({
      rel: "0",
      playsinline: "1",
      modestbranding: "1",
      ...(autoplay ? { autoplay: "1" } : {}),
    });
    els.player.src = `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
    els.boutEyebrow.textContent = isLastVideo
      ? finalBoutVerified ? "結びの一番" : "最後の収録取組"
      : `第${state.currentIndex + 1}取組`;
    els.boutTitle.textContent = video.displayTitle;
    const tournamentLabel = state.activeArchiveId
      ? state.tournament.displayLabel
      : state.tournament.label;
    document.title = `${displayDayName(state.selectedDay.day)} ${video.displayTitle}｜${tournamentLabel}｜大相撲 取組ダイジェスト`;
  } else {
    els.player.removeAttribute("src");
    const tournamentLabel = state.activeArchiveId
      ? state.tournament.displayLabel
      : state.tournament.label;
    document.title = `${displayDayName(state.selectedDay.day)} ${tournamentLabel} 取組ダイジェスト｜大相撲`;
  }

  els.previousButton.disabled = !hasVideo || state.currentIndex === 0;
  els.nextButton.disabled = !hasVideo || state.currentIndex === videos.length - 1;
  els.nextButton.querySelector("span:first-child").textContent =
    isLastVideo
      ? finalBoutVerified
        ? state.activeArchiveId ? "この日の結びです" : "本日の結びです"
        : "収録済みの最後です"
      : "次の取組";
}

function selectDay(dayNumber) {
  state.selectedDay = state.days.find((item) => item.day === Number(dayNumber)) || state.days.at(-1);
  state.currentIndex = 0;
  const { day, date, videos, complete } = state.selectedDay;

  els.daySelect.value = String(day);
  els.dateLabel.textContent = displayDate(date, true);
  els.countLabel.textContent = videos.length
    ? `${videos.length}取組を収録`
    : state.activeArchiveId ? "0取組を収録" : "動画の公開待ち";
  els.statusPill.textContent = state.activeArchiveId
    ? "アーカイブ"
    : complete ? "全取組 公開済み" : videos.length ? "順次更新中" : "18時・19時 更新";
  els.statusPill.classList.toggle("complete", !state.activeArchiveId && complete);
  updateVideo();

  try {
    const url = new URL(window.location.href);
    if (state.activeArchiveId) {
      url.searchParams.set("basho", state.activeArchiveId);
    } else {
      url.searchParams.delete("basho");
    }
    url.searchParams.set("day", String(day));
    history.replaceState(null, "", url);
  } catch (error) {
    console.warn("選択日のURL保存を省略しました", error);
  }
}

function selectArchive(archiveId, dayNumber) {
  const tournament = state.archiveTournaments.find((item) => item.id === archiveId);
  if (!tournament) return;
  setTournament(tournament, archiveId);
  const requestedDay = dayNumber == null
    ? null
    : tournament.days.find((item) => item.day === Number(dayNumber));
  selectDay(requestedDay?.day || latestArchiveDay(tournament)?.day);
}

function selectCurrentTournament() {
  const restoreFocus = document.activeElement === els.currentTournamentButton;
  setTournament(state.data.tournament);
  selectDay(latestCurrentDayWithVideos()?.day);
  if (restoreFocus) els.daySelect.focus({ preventScroll: true });
}

function moveBy(amount) {
  const next = state.currentIndex + amount;
  if (next < 0 || next >= selectedVideos().length) return;
  state.currentIndex = next;
  updateVideo({ autoplay: true });
  document.querySelector(".viewer-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  const handleDaySelection = (event) => {
    const selected = Number(event.currentTarget.value);
    if (state.selectedDay?.day !== selected) selectDay(selected);
  };
  els.daySelect.addEventListener("change", handleDaySelection);
  els.daySelect.addEventListener("input", handleDaySelection);
  els.previousButton.addEventListener("click", () => moveBy(-1));
  els.nextButton.addEventListener("click", () => moveBy(1));
  els.archiveList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-archive-id]");
    if (button) {
      selectArchive(button.dataset.archiveId);
      els.viewerShell.tabIndex = -1;
      els.viewerShell.focus({ preventScroll: true });
    }
  });
  els.currentTournamentButton.addEventListener("click", selectCurrentTournament);

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("select, button, input, textarea")) return;
    if (event.key === "ArrowLeft") moveBy(-1);
    if (event.key === "ArrowRight") moveBy(1);
  });

  let touchStartX = null;
  const playerFrame = document.querySelector("#player-frame");
  playerFrame.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  playerFrame.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 70) moveBy(distance > 0 ? -1 : 1);
    touchStartX = null;
  }, { passive: true });
}

async function init() {
  try {
    if (window.SUMO_DIGEST_DATA) {
      state.data = window.SUMO_DIGEST_DATA;
    } else {
      const response = await fetch("data/bouts.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`データ取得エラー: ${response.status}`);
      state.data = await response.json();
    }
    state.archiveData = window.SUMO_DIGEST_ARCHIVES || { tournaments: [] };
    state.archiveTournaments = state.archiveData.tournaments || [];
    renderArchiveList();
    setTournament(state.data.tournament);
    bindEvents();

    const params = new URLSearchParams(location.search);
    const bashoParameterPresent = params.has("basho");
    const requestedBasho = params.get("basho");
    const dayParameterPresent = params.has("day");
    const requestedDay = Number(params.get("day"));
    const archive = state.archiveTournaments.find((item) => item.id === requestedBasho);

    if (requestedBasho && archive) {
      const archiveDay = dayParameterPresent
        ? archive.days.find((item) => item.day === requestedDay)
        : latestArchiveDay(archive);
      if (archiveDay) {
        selectArchive(archive.id, archiveDay.day);
        return;
      }
    }

    const currentDays = state.days;
    const availableRequestedDay = !bashoParameterPresent && currentDays.some((item) => item.day === requestedDay);
    selectDay(availableRequestedDay ? requestedDay : latestCurrentDayWithVideos()?.day);
  } catch (error) {
    console.error(error);
    els.countLabel.textContent = "読み込みエラー";
    els.emptyState.hidden = false;
    els.player.hidden = true;
    els.boutInfo.hidden = true;
  }
}

init();
