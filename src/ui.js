// ─────────────────────────────────────────────
//  GOING UP  ·  UI Manager
// ─────────────────────────────────────────────

import { FLOORS, CARDS, DAYS } from './data.js';
import { AudioManager } from './audio.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = el(`screen-${name}`);
  if (target) target.classList.add('active');
}

function floorLabel(f) {
  if (f === 'basement') return 'B';
  return String(f).padStart(2, '0');
}

function floorName(f) {
  const data = FLOORS[f];
  return data ? data.name : `Floor ${floorLabel(f)}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;
export function showToast(message, type = '', duration = 3000) {
  const t = el('toast');
  t.textContent = message;
  t.className = `toast visible${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), duration);
}

// ── UIManager ─────────────────────────────────────────────────────────────────

export class UIManager {
  /**
   * @param {import('./engine.js').GameEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    this._pendingCards = [];
    this._boardingFloor = null;
    this.audio = new AudioManager();
    this._bind();
    this._wireEngineEvents();
  }

  // ── Wire engine events ────────────────────────────────────

  _wireEngineEvents() {
    const { engine } = this;

    engine.on('dayStarted', ({ dayIndex, day }) => {
      this.audio.setDay(dayIndex);
      this.audio.startAmbient();
      this._renderShiftUI();
      setScreen('shift');
    });

    engine.on('moved', ({ floor, dir, cost }) => {
      el('ind-floor').textContent = floorLabel(floor);
      el('ind-dir').textContent = dir;
      this._updateShiftStats();
      this._renderPanel();
      this._updateCarPosition();     // animate car to new floor (cheap, no DOM rebuild)
      this._renderCabPassengers();
      this._updateGoButton(null);
      const moveSec = Math.max(0.3, (cost ?? 1) * 0.25);
      this.audio.playMovement(moveSec);
    });

    engine.on('doorsOpened', ({ floor, exiting, waiting, floorData }) => {
      this._boardingFloor = floor;
      this._updateShaftDoorState(true);  // glow the car
      this._renderBoardingScreen(floor, exiting, waiting, floorData);
      this.audio.playDing();
      setScreen('boarding');
    });

    engine.on('doorsClosed', () => {
      setScreen('shift');
      this._boardingFloor = null;
      this._updateShaftDoorState(false);
      this._renderPanel();
      this._renderBuildingShaft();   // refresh waiting dots
      this._renderCabPassengers();
      this._renderManifest();
      this._updateShiftStats();
      this._updateGoButton(null);
    });

    engine.on('passengerBoarded', () => {
      this._refreshBoardingScreen();
      this._updateCarContent();      // show new passenger in shaft car
      this._renderCabPassengers();
      this._updateShiftStats();
    });

    engine.on('passengerRefused', () => {
      this._refreshBoardingScreen();
      this._renderManifest();
    });

    engine.on('passengerDelivered', ({ result }) => {
      this._renderManifest();
      this._updateShiftStats();
      this._updateCarContent();      // remove delivered passenger from car
      if (result && result.tip > 0) this.audio.playTip();
    });

    engine.on('log', ({ type, message }) => {
      this._appendLog(type, message);
    });

    engine.on('complaintFiled', ({ total }) => {
      this._renderComplaints(total);
      showToast('Complaint filed.', 'complaint');
      this.audio.playComplaint();
    });

    engine.on('shiftForcedEnd', () => {
      showToast('Three complaints. Shift over.', 'complaint', 4000);
    });

    engine.on('secretLearned', ({ archetypeId, text }) => {
      showToast(`Learned: ${text}`, 'secret', 4000);
      this._renderManifest();
      this.audio.playSecret();
    });

    engine.on('floorUnlocked', ({ floor }) => {
      const name = floor === 'basement' ? 'the Basement' : `Floor ${floor}`;
      showToast(`${name} is now accessible.`, 'unlock');
      this._renderPanel();
      this._renderBuildingShaft();   // show newly unlocked floor in shaft
    });

    engine.on('cardFragment', () => {
      showToast('The Inspector leaves you something useful.', 'unlock');
    });

    engine.on('selectionChanged', ({ floor }) => {
      this._updatePanelSelection(floor);
      this._updateGoButton(floor);
    });

    engine.on('shiftEnded', (data) => {
      // small delay so final log entries appear
      setTimeout(() => setScreen('shift'), 100);
    });

    engine.on('cardSelectBegin', ({ cards }) => {
      this._pendingCards = cards;
      this._renderCardScreen(cards);
      setTimeout(() => setScreen('cards'), 600);
    });

    engine.on('cardSelected', () => {
      // engine handles next day or week end
    });

    engine.on('weekEnded', (data) => {
      this._renderWeekEnd(data);
      this.audio.stopAll();
      setTimeout(() => setScreen('week-end'), 600);
    });

    engine.on('spoke', ({ passenger }) => {
      this._refreshBoardingScreen();
    });
  }

  // ── Button bindings ───────────────────────────────────────

  _bind() {
    el('btn-start').addEventListener('click', () => {
      this.audio.init(); // must be in a user gesture
      this.engine.startRun();
    });

    el('btn-go').addEventListener('click', () => {
      const snap = this.engine.snapshot();
      if (snap.selectedFloor !== null) {
        this.engine.moveTo(snap.selectedFloor);
      }
    });

    el('btn-open-doors').addEventListener('click', () => {
      this.engine.openDoorsAtCurrentFloor();
    });

    el('btn-end-day').addEventListener('click', () => {
      if (confirm('End this shift early?')) {
        this.engine.endShift();
      }
    });

    el('btn-close-doors').addEventListener('click', () => {
      this.engine.closeDoors();
    });

    el('btn-again').addEventListener('click', () => {
      this.audio.init();
      this.engine.startRun();
    });
  }

  // ── Panel rendering ───────────────────────────────────────

  _renderPanel() {
    const snap = this.engine.snapshot();
    const container = el('panel-buttons');
    container.innerHTML = '';

    const { unlockedFloors, floor: currentFloor, waitingAt, stopQueue } = snap;

    // All floors the building knows about, sorted
    const allFloors = this._allKnownFloors(unlockedFloors);

    for (const f of allFloors) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      btn.dataset.floor = f;
      btn.textContent = floorLabel(f);

      const isUnlocked = unlockedFloors.includes(f);
      const isCurrent = f === currentFloor;
      const hasWaiting = (waitingAt[f] ?? []).some(p => !p.inCab && !p.delivered && !p.abandoned);
      const isInQueue = stopQueue.includes(f);
      const isSelected = snap.selectedFloor === f;

      if (!isUnlocked) {
        btn.classList.add('locked');
        btn.disabled = true;
      } else if (isCurrent) {
        btn.classList.add('current');
        btn.disabled = true;
      } else {
        if (hasWaiting) {
          btn.classList.add('has-waiting');
          const dot = document.createElement('div');
          dot.className = 'waiting-dot';
          btn.appendChild(dot);
        }
        if (isInQueue) btn.classList.add('queue-lit');
        if (isSelected) btn.classList.add('selected');

        btn.addEventListener('click', () => {
          this.engine.selectFloor(f);
        });
      }

      container.appendChild(btn);
    }
  }

  _allKnownFloors(unlocked) {
    // Show 1–10 always, plus any unlocked extras, sorted
    const set = new Set([...unlocked]);
    for (let i = 1; i <= 10; i++) set.add(i);
    return [...set].sort((a, b) => {
      if (a === 'basement') return 1; // basement at bottom
      if (b === 'basement') return -1;
      return b - a; // higher floors at top
    });
  }

  _updatePanelSelection(selectedFloor) {
    document.querySelectorAll('.panel-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.floor == selectedFloor);
    });
  }

  _updateGoButton(selectedFloor) {
    const snap = this.engine.snapshot();
    const btn = el('btn-go');

    if (!selectedFloor) {
      btn.disabled = true;
      // Check if anything is waiting at current floor
      const here = (snap.waitingAt[snap.floor] ?? [])
        .filter(p => !p.inCab && !p.delivered && !p.abandoned);
      if (here.length > 0) {
        el('floor-status').innerHTML =
          `<span class="highlight">${here.length} waiting here.</span> Press OPEN DOORS.`;
      } else {
        el('floor-status').innerHTML = 'Select a floor on the panel.';
      }
      return;
    }

    const cost = this.engine.actionCostTo(selectedFloor);
    const canMove = this.engine.canMove(selectedFloor);

    btn.disabled = !canMove;

    const floorDisp = selectedFloor === 'basement' ? 'Basement' : `Floor ${selectedFloor}`;
    const costColor = canMove ? 'var(--amber)' : 'var(--complaint-light)';
    el('floor-status').innerHTML =
      `<span class="highlight">${floorDisp}</span> — ` +
      `<span class="cost" style="color:${costColor}">${cost} action${cost !== 1 ? 's' : ''}</span>`;
  }

  // ── Shift screen rendering ────────────────────────────────

  _renderShiftUI() {
    const snap = this.engine.snapshot();

    // Ceiling
    el('ceiling-day').textContent = snap.day.toUpperCase();
    el('ind-floor').textContent = floorLabel(snap.floor);
    el('ind-dir').textContent = '—';

    // Stats
    this._updateShiftStats();

    // Panel
    this._renderPanel();

    // Building shaft (full re-render for new day)
    this._renderBuildingShaft();

    // Manifest
    this._renderManifest();

    // Clear log
    el('action-log').innerHTML = '';

    // Clear cab
    el('cab-passengers').innerHTML = '';

    // Status (checks for waiting passengers at current floor)
    this._updateGoButton(null);

    // Elevator info
    el('info-cap').textContent = snap.capacity;
    el('info-spd').textContent = snap.speed;
    el('info-cond').textContent = snap.condition;
  }

  // ── Building shaft ────────────────────────────────────────

  /**
   * Full re-render of the building shaft wireframe.
   * Called on day start, floor unlock, and after doorsClosed.
   */
  _renderBuildingShaft() {
    const snap = this.engine.snapshot();
    const floors = this._allKnownFloors(snap.unlockedFloors); // top→bottom
    const N = floors.length;
    const currentFloor = snap.floor;
    const idx = Math.max(0, floors.indexOf(currentFloor));

    // Drive elevator car position via CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--shaft-n', N);
    root.style.setProperty('--shaft-idx', idx);

    // Left column: floor number labels
    const leftCol = el('shaft-left-col');
    leftCol.innerHTML = '';
    for (const f of floors) {
      const row = document.createElement('div');
      row.className = 'shaft-label-row' + (f === currentFloor ? ' is-current' : '');
      row.textContent = floorLabel(f);
      leftCol.appendChild(row);
    }

    // Right column: waiting passenger sprites
    const rightCol = el('shaft-right-col');
    rightCol.innerHTML = '';
    for (const f of floors) {
      const row = document.createElement('div');
      row.className = 'shaft-waiting-row';
      const waiting = (snap.waitingAt[f] ?? []).filter(
        p => !p.inCab && !p.delivered && !p.abandoned
      );
      for (const p of waiting) {
        const span = document.createElement('span');
        span.className = 'shaft-wait-icon';
        span.textContent = p.sprite;
        span.style.color = p.color;
        span.title = p.name;
        row.appendChild(span);
      }
      rightCol.appendChild(row);
    }

    // Update car content (passengers inside)
    this._updateCarContent();
  }

  /** Update only the elevator car position without re-rendering all floor rows */
  _updateCarPosition() {
    const snap = this.engine.snapshot();
    const floors = this._allKnownFloors(snap.unlockedFloors);
    const N = floors.length;
    const idx = Math.max(0, floors.indexOf(snap.floor));
    const root = document.documentElement;
    root.style.setProperty('--shaft-n', N);
    root.style.setProperty('--shaft-idx', idx);

    // Update current-floor highlight in label column
    document.querySelectorAll('.shaft-label-row').forEach((row, i) => {
      row.classList.toggle('is-current', i === idx);
    });
  }

  /** Update the passenger sprite icons rendered inside the elevator car */
  _updateCarContent() {
    const snap = this.engine.snapshot();
    const carContent = el('car-content');
    if (!carContent) return;
    carContent.innerHTML = snap.cabPassengers.map(p =>
      `<span class="car-icon" style="color:${p.color}" title="${p.name}">${p.sprite}</span>`
    ).join('');
  }

  /** Toggle the elevator car's open-doors glow state */
  _updateShaftDoorState(isOpen) {
    const car = el('elevator-car');
    if (car) car.classList.toggle('doors-open', isOpen);
  }

  _updateShiftStats() {
    const snap = this.engine.snapshot();
    el('stat-actions').textContent = snap.actionsLeft;
    el('stat-complaints').textContent = `${snap.complaints} / 3`;
    el('footer-tips').textContent = `$${snap.tips}`;

    const cw = el('stat-complaints-wrap');
    cw.classList.toggle('danger', snap.complaints >= 2);

    this._renderComplaints(snap.complaints);
  }

  _renderComplaints(count) {
    for (let i = 0; i < 3; i++) {
      const dot = el(`cdot-${i}`);
      if (dot) dot.classList.toggle('filled', i < count);
    }
  }

  _renderManifest() {
    const snap = this.engine.snapshot();
    const container = el('manifest-list');
    container.innerHTML = '';

    const allPassengers = this.engine.state.shift.passengers;

    for (const p of allPassengers) {
      const entry = document.createElement('div');
      entry.className = 'manifest-entry';
      if (p.delivered) entry.classList.add('delivered');
      if (p.abandoned) entry.classList.add('abandoned');

      const knowSecret = snap.knownSecrets[p.archetypeId];
      const seeAll = snap.abilities.seeAllHidden;
      const fmtDest = (f) => f === 'basement' ? 'B' : `F${floorLabel(f)}`;
      const destDisplay = (snap.abilities.knowActual && p.realDest !== p.statedDest)
        ? `→ ${fmtDest(p.realDest)} <em style="color:#6080A0">(says ${fmtDest(p.statedDest)})</em>`
        : `→ ${fmtDest(p.statedDest)}`;

      entry.innerHTML = `
        <div class="entry-name">
          <span class="entry-sprite" style="color:${p.color}">${p.sprite}</span>
          ${p.name}
        </div>
        <div class="entry-dest">${destDisplay}</div>
        <div class="entry-visible">${p.visible}</div>
        ${(knowSecret || seeAll) && p.archetype.hiddenText
          ? `<div class="entry-secret">✦ ${p.archetype.hiddenText}</div>` : ''}
        <div class="entry-board">boards F${floorLabel(p.boardFloor)}</div>
      `;

      container.appendChild(entry);
    }
  }

  _renderCabPassengers() {
    const snap = this.engine.snapshot();
    const container = el('cab-passengers');
    container.innerHTML = '';

    for (const p of snap.cabPassengers) {
      const tag = document.createElement('div');
      tag.className = 'cab-passenger-tag';
      if (p.spokeTo) tag.classList.add('spoke');
      tag.dataset.pid = p.id;
      tag.innerHTML = `
        <span class="cab-passenger-sprite" style="color:${p.color}">${p.sprite}</span>
        <span>${p.name}</span>
        <span class="cab-passenger-dest">→ F${floorLabel(p.statedDest)}</span>
      `;
      // Click to speak (shortcut from main cab view)
      tag.addEventListener('click', () => {
        if (!p.spokeTo) {
          this.engine.speakTo(p.id);
          tag.classList.add('spoke');
          showToast(`You say something to ${p.name}.`);
        }
      });
      container.appendChild(tag);
    }
  }

  _appendLog(type, message) {
    const log = el('action-log');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    log.prepend(entry);
    // Keep log manageable
    while (log.children.length > 30) {
      log.removeChild(log.lastChild);
    }
  }

  // ── Boarding screen ───────────────────────────────────────

  _renderBoardingScreen(floor, exiting, waiting, floorData) {
    const snap = this.engine.snapshot();

    // Header
    const floorNum = floor === 'basement' ? 'BASEMENT' : `FLOOR ${floorLabel(floor)}`;
    el('boarding-floor-num').textContent = floorNum;
    el('boarding-floor-name').textContent = floorData ? floorData.name : `Floor ${floorLabel(floor)}`;

    // Apply floor colour to boarding header and diorama
    if (floorData) {
      const headerEl = el('boarding-floor-num').closest('.boarding-header');
      if (headerEl) {
        headerEl.style.borderBottom = `1px solid ${floorData.textColor ?? '#555'}44`;
        headerEl.style.background = floorData.color ?? '';
      }
    }

    // Diorama description
    el('boarding-diorama').textContent = floorData
      ? floorData.description
      : 'The doors open. You don\'t know this floor yet.';

    // Diorama color
    if (floorData && floorData.color) {
      el('boarding-diorama').style.background = floorData.color;
      el('boarding-diorama').style.color = floorData.textColor ?? 'rgba(255,255,255,0.6)';
    }

    // Exiting passengers
    const exitingSection = el('boarding-exiting-section');
    const exitingContainer = el('boarding-exiting');
    exitingContainer.innerHTML = '';
    exitingSection.classList.toggle('hidden', exiting.length === 0);

    for (const p of exiting) {
      const tag = document.createElement('div');
      tag.className = 'boarding-exiting-tag';
      tag.innerHTML = `
        <span style="color:${p.color}">${p.sprite}</span>
        <span>${p.name} — exiting here</span>
      `;
      exitingContainer.appendChild(tag);
    }

    // Waiting passengers
    this._renderWaitingPassengers(waiting, snap);

    // Cab passengers (for speak)
    this._renderCabInBoardingScreen(snap);
  }

  _renderWaitingPassengers(waiting, snap) {
    const waitingSection = el('boarding-waiting-section');
    const waitingContainer = el('boarding-waiting');
    waitingContainer.innerHTML = '';
    waitingSection.classList.toggle('hidden', waiting.length === 0);

    const cabFull = snap.cabPassengers.length >= snap.capacity;

    for (const p of waiting) {
      const knowSecret = snap.knownSecrets[p.archetypeId];
      const seeAll = snap.abilities.seeAllHidden;
      const revealNow = snap.abilities.revealOnArrival;
      const showSecret = knowSecret || seeAll || revealNow;

      const div = document.createElement('div');
      div.className = 'boarding-passenger';

      const fmtDestB = (f) => f === 'basement' ? 'Basement' : `Floor ${floorLabel(f)}`;
      const destDisplay = (snap.abilities.knowActual && p.realDest !== p.statedDest)
        ? `${fmtDestB(p.realDest)} <span style="color:#6080A0;font-size:0.55rem">(says ${fmtDestB(p.statedDest)})</span>`
        : fmtDestB(p.statedDest);

      div.innerHTML = `
        <div class="boarding-passenger-info">
          <div class="boarding-passenger-name">
            <span style="color:${p.color}">${p.sprite}</span>
            ${p.name}
          </div>
          <div class="boarding-passenger-visible">${p.visible}</div>
          <div class="boarding-passenger-dest">→ ${destDisplay}</div>
          ${showSecret && p.archetype.hiddenText
            ? `<div class="boarding-passenger-secret">✦ ${p.archetype.hiddenText}</div>` : ''}
          ${knowSecret && p.archetype.learnedMessage
            ? `<div class="boarding-passenger-known">You remember: "${p.archetype.learnedMessage}"</div>` : ''}
        </div>
        <div class="boarding-passenger-btns">
          <button class="btn-board" data-pid="${p.id}" ${cabFull ? 'disabled title="Cab full"' : ''}>BOARD</button>
          <button class="btn-refuse" data-pid="${p.id}">REFUSE</button>
        </div>
      `;

      div.querySelector('.btn-board').addEventListener('click', (e) => {
        const result = this.engine.boardPassenger(p.id);
        if (!result.success) showToast(result.reason, 'complaint');
      });

      div.querySelector('.btn-refuse').addEventListener('click', () => {
        this.engine.refusePassenger(p.id);
      });

      waitingContainer.appendChild(div);
    }
  }

  _renderCabInBoardingScreen(snap) {
    const cabSection = el('boarding-cab-section');
    const cabContainer = el('boarding-cab');
    cabContainer.innerHTML = '';

    const hasGrievingWoman = snap.cabPassengers.some(p => p.archetypeId === 'grievingWoman' && !p.spokeTo);
    cabSection.classList.toggle('hidden', snap.cabPassengers.length === 0);

    for (const p of snap.cabPassengers) {
      const div = document.createElement('div');
      div.className = 'boarding-passenger';
      div.style.opacity = '0.7';

      div.innerHTML = `
        <div class="boarding-passenger-info">
          <div class="boarding-passenger-name">
            <span style="color:${p.color}">${p.sprite}</span>
            ${p.name}
          </div>
          <div class="boarding-passenger-visible">${p.visible}</div>
          <div class="boarding-passenger-dest">→ ${p.statedDest === 'basement' ? 'Basement' : 'Floor ' + floorLabel(p.statedDest)}</div>
          ${p.spokeTo ? '<div class="boarding-passenger-known">You already spoke.</div>' : ''}
        </div>
        <div class="boarding-passenger-btns">
          ${!p.spokeTo
            ? `<button class="btn-speak" data-pid="${p.id}">SPEAK</button>`
            : `<button class="btn-speak spoke" disabled>SPOKE</button>`}
        </div>
      `;

      const speakBtn = div.querySelector('.btn-speak');
      if (speakBtn && !p.spokeTo) {
        speakBtn.addEventListener('click', () => {
          this.engine.speakTo(p.id);
          speakBtn.textContent = 'SPOKE';
          speakBtn.classList.add('spoke');
          speakBtn.disabled = true;
        });
      }

      cabContainer.appendChild(div);
    }
  }

  _refreshBoardingScreen() {
    if (this.engine.state.phase !== 'boarding') return;
    const floor = this._boardingFloor;
    if (floor === null) return;

    const snap = this.engine.snapshot();
    const exiting = this.engine.getExitingAt(floor);
    const waiting = this.engine.getWaitingAt(floor);
    const floorData = FLOORS[floor] ?? null;

    // Re-render the waiting/exiting sections (keep diorama)
    const exitingSection = el('boarding-exiting-section');
    const exitingContainer = el('boarding-exiting');
    exitingContainer.innerHTML = '';
    exitingSection.classList.toggle('hidden', exiting.length === 0);

    for (const p of exiting) {
      const tag = document.createElement('div');
      tag.className = 'boarding-exiting-tag';
      tag.innerHTML = `<span style="color:${p.color}">${p.sprite}</span> <span>${p.name} — exiting here</span>`;
      exitingContainer.appendChild(tag);
    }

    this._renderWaitingPassengers(waiting, snap);
    this._renderCabInBoardingScreen(snap);
  }

  // ── Card screen ───────────────────────────────────────────

  _renderCardScreen(cards) {
    const snap = this.engine.snapshot();
    const prevDayIndex = snap.dayIndex - 1;
    const prevDay = DAYS[prevDayIndex] ?? 'Friday';

    el('card-day-label').textContent = prevDay.toUpperCase();

    const delivered = this.engine.state.shift.delivered.length;
    const total = this.engine.state.shift.passengers.length;
    const tips = this.engine.state.shift.tips;
    const complaints = this.engine.state.shift.complaints;

    el('card-summary').innerHTML =
      `${delivered} of ${total} delivered &nbsp;·&nbsp; ` +
      `$${tips} in tips &nbsp;·&nbsp; ` +
      `${complaints} complaint${complaints !== 1 ? 's' : ''}`;

    const container = el('cards-offered');
    container.innerHTML = '';

    for (const card of cards) {
      const div = document.createElement('div');
      div.className = `game-card ${card.isCurse ? 'curse' : ''}`;

      div.innerHTML = `
        <div class="card-category">${card.category}</div>
        <div class="card-name">${card.name}</div>
        <div class="card-desc">${card.desc}</div>
        <div class="card-flavor">${card.flavor}</div>
      `;

      div.addEventListener('click', () => {
        this.engine.selectCard(card.id);
      });

      container.appendChild(div);
    }
  }

  // ── Week end screen ───────────────────────────────────────

  _renderWeekEnd({ fired, score, totalTips, weekComplaints, cards, floor30unlocked }) {
    if (fired) {
      el('week-end-title').textContent = 'You Are Dismissed.';
      el('week-end-body').textContent =
        'The building management left a note in your booth. You did not read it. ' +
        'You already knew what it said.';
    } else {
      el('week-end-title').textContent = 'End of the Week.';
      if (floor30unlocked) {
        el('week-end-body').innerHTML =
          'You made it to Friday. You found Floor 30.<br>' +
          'One passenger. No request given. You chose where they went.<br>' +
          'The doors closed. The indicator showed a number you didn\'t recognise.<br>' +
          'You went home. You didn\'t tell anyone.';
      } else {
        el('week-end-body').textContent =
          'You made it to Friday. The building is still there. ' +
          'The indicator above the door still shows floor numbers you haven\'t pressed. ' +
          'You go home. You\'ll be back Monday.';
      }
    }

    el('week-end-score').textContent = `Score: ${Math.max(0, score)}`;

    el('week-end-stats').innerHTML = `
      <div class="week-end-stat"><strong>$${totalTips}</strong><span>tips earned</span></div>
      <div class="week-end-stat"><strong>${weekComplaints}</strong><span>complaints</span></div>
      <div class="week-end-stat"><strong>${cards.length}</strong><span>cards held</span></div>
    `;

    const cardsContainer = el('week-end-cards');
    cardsContainer.innerHTML = '';
    for (const cardId of cards) {
      const card = CARDS[cardId];
      if (!card) continue;
      const chip = document.createElement('div');
      chip.className = 'week-card-chip';
      chip.textContent = card.name;
      cardsContainer.appendChild(chip);
    }
  }
}
