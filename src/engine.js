// ─────────────────────────────────────────────
//  GOING UP  ·  Game Engine
// ─────────────────────────────────────────────

import {
  ARCHETYPES, FLOORS, STARTING_FLOORS, CARDS,
  SHIFT_SCHEDULES, DAYS, LOG_MESSAGES,
} from './data.js';

// ── Passenger ────────────────────────────────────────────────────────────────

export class Passenger {
  constructor({ archetype, boardFloor, destFloor, actualDestFloor }) {
    this.id = `p_${Math.random().toString(36).slice(2, 8)}`;
    this.archetypeId = archetype;
    this.archetype = ARCHETYPES[archetype];
    this.boardFloor = boardFloor;
    this.destFloor = destFloor;
    this.actualDestFloor = actualDestFloor ?? destFloor;

    // Runtime state
    this.inCab = false;
    this.delivered = false;
    this.abandoned = false;
    this.boardedAtAction = null;   // action count when they boarded
    this.stopsWhileAboard = 0;     // stops made (not counting board floor)
    this.spokeTo = false;          // operator spoke to them
    this.sharedCabWithPair = false; // couple mechanic
    this.buttonsPressed = 0;       // kid mechanic (extra floor lights added)
  }

  get name()    { return this.archetype.name; }
  get sprite()  { return this.archetype.sprite; }
  get color()   { return this.archetype.color; }
  get visible() { return this.archetype.visible; }
  get pairId()  { return this.archetype.pairId ?? null; }

  /** What floor they say they want (may differ for the Kid) */
  get statedDest() { return this.destFloor; }
  /** What floor they actually want */
  get realDest()   { return this.actualDestFloor; }
}

// ── GameEngine ───────────────────────────────────────────────────────────────

export class GameEngine {
  constructor() {
    this._listeners = {};
    this.state = null;
    this.init();
  }

  // ── Event bus ─────────────────────────────────────

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] ?? []).push(fn);
    return this;
  }

  emit(event, data = {}) {
    (this._listeners[event] ?? []).forEach(fn => fn(data));
  }

  // ── Initialization ────────────────────────────────

  init() {
    this.state = {
      phase: 'title',   // title | shift | boarding | card-select | week-end

      run: {
        dayIndex: 0,        // 0 = Monday … 4 = Friday
        weekComplaints: 0,
        cards: [],          // collected card ids
        knownSecrets: {},   // archetypeId → true
        actionBonusPerDay: 0,
        extraPassengersPerDay: 0,
        forceInspector: false,
        score: 0,
        totalTips: 0,
      },

      elevator: {
        floor: 1,
        passengers: [],     // Passenger instances currently in cab
        capacity: 4,
        speed: 1,
        condition: 100,
        doorsOpen: false,
        stopCount: 0,       // total stops this shift
        polishedBrass: false,
        structuralIssues: false,
        // pending movement highlight
        selectedFloor: null,
      },

      shift: {
        actionsLeft: 20,
        actionsTotal: 20,
        complaints: 0,
        tips: 0,
        passengers: [],     // all Passenger instances this shift
        delivered: [],
        abandoned: [],
        log: [],            // { type, message } entries
        active: false,
        ended: false,
        stopQueue: [],      // extra floors lit by kid
      },

      building: {
        unlockedFloors: [...STARTING_FLOORS],
        waitingAt: {},      // floor → Passenger[]

        unlockFloor(id) {
          if (!this.unlockedFloors.includes(id)) {
            this.unlockedFloors.push(id);
          }
        },
      },

      operator: {
        abilities: {
          emergencyStop: false,
          emergencyStopUsed: false,
          revealOnArrival: false,
          seeAllHidden: false,
          ignoreJammed: false,
          knowActual: false,
          summonVIP: false,
          summonVIPUsed: false,
        },
      },
    };
  }

  // ── Run management ────────────────────────────────

  startRun() {
    this.init();
    this._beginDay();
  }

  _beginDay() {
    const { state } = this;
    const dayIndex = state.run.dayIndex;

    const baseActions = 20 + state.run.actionBonusPerDay;

    // Reset shift
    state.shift = {
      actionsLeft: baseActions,
      actionsTotal: baseActions,
      complaints: 0,
      tips: 0,
      passengers: [],
      delivered: [],
      abandoned: [],
      log: [],
      active: true,
      ended: false,
      stopQueue: [],
    };

    // Reset elevator (keep upgrades)
    state.elevator.floor = 1;
    state.elevator.passengers = [];
    state.elevator.doorsOpen = false;
    state.elevator.stopCount = 0;
    state.elevator.selectedFloor = null;

    // Reset per-shift ability flags
    state.operator.abilities.emergencyStopUsed = false;
    state.operator.abilities.summonVIPUsed = false;

    // Build passenger list
    const schedule = SHIFT_SCHEDULES[dayIndex] ?? SHIFT_SCHEDULES[0];
    const passengers = schedule.map(s => new Passenger(s));

    // Force inspector if curse active
    if (state.run.forceInspector && !passengers.some(p => p.archetypeId === 'inspector')) {
      passengers.push(new Passenger({ archetype: 'inspector', boardFloor: 1, destFloor: 8 }));
    }

    // Extra passengers from curse
    for (let i = 0; i < state.run.extraPassengersPerDay; i++) {
      const floor = Math.floor(Math.random() * 8) + 1;
      const dest  = Math.floor(Math.random() * 8) + 1;
      passengers.push(new Passenger({ archetype: 'worker', boardFloor: floor, destFloor: dest === floor ? dest + 1 : dest }));
    }

    state.shift.passengers = passengers;

    // Populate waitingAt
    state.building.waitingAt = {};
    for (const p of passengers) {
      const f = p.boardFloor;
      (state.building.waitingAt[f] = state.building.waitingAt[f] ?? []).push(p);
    }

    state.phase = 'shift';
    this.emit('dayStarted', { dayIndex, day: DAYS[dayIndex] });
    this._log('start', `Shift begins. ${DAYS[dayIndex]}.`);
  }

  // ── Queries ───────────────────────────────────────

  get currentFloor() { return this.state.elevator.floor; }

  getFloorData(id) { return FLOORS[id] ?? null; }

  getWaitingAt(floor) {
    return (this.state.building.waitingAt[floor] ?? []).filter(p => !p.inCab && !p.delivered && !p.abandoned);
  }

  getExitingAt(floor) {
    return this.state.elevator.passengers.filter(p => {
      const target = p.realDest;
      return target === floor || target === String(floor);
    });
  }

  actionCostTo(floor) {
    const { elevator } = this.state;
    if (floor === 'basement') {
      // basement is below floor 1
      const currentNumeric = elevator.floor === 'basement' ? 0 : elevator.floor;
      const dist = Math.ceil(currentNumeric / elevator.speed);
      return dist + 1;
    }
    const currentNumeric = elevator.floor === 'basement' ? 0 : elevator.floor;
    const dist = Math.ceil(Math.abs(floor - currentNumeric) / elevator.speed);
    return dist + 1; // +1 for the stop itself
  }

  canMove(floor) {
    const { state } = this;
    if (state.shift.ended) return false;
    if (floor === state.elevator.floor) return false;
    if (!state.building.unlockedFloors.includes(floor)) return false;
    const cost = this.actionCostTo(floor);
    return state.shift.actionsLeft >= cost;
  }

  // ── Player actions ────────────────────────────────

  /**
   * Select a floor on the panel (highlights it, shows cost).
   * Does NOT move. Call moveTo() to commit.
   */
  selectFloor(floor) {
    if (!this.state.building.unlockedFloors.includes(floor)) return;
    this.state.elevator.selectedFloor = floor;
    this.emit('selectionChanged', { floor });
  }

  /**
   * Move the elevator to the selected (or specified) floor.
   * Returns { success, reason }
   */
  moveTo(floor) {
    const { state } = this;
    if (state.shift.ended) return { success: false, reason: 'Shift ended.' };
    if (floor === undefined) floor = state.elevator.selectedFloor;
    if (floor === null || floor === undefined) return { success: false, reason: 'No floor selected.' };
    if (floor === state.elevator.floor) return { success: false, reason: 'Already on that floor.' };
    if (!state.building.unlockedFloors.includes(floor)) return { success: false, reason: 'Floor not accessible.' };

    const cost = this.actionCostTo(floor);
    const useEmergencyStop = state.operator.abilities.emergencyStop && !state.operator.abilities.emergencyStopUsed;
    const actualCost = useEmergencyStop ? cost - 1 : cost; // emergency stop saves 1

    if (state.shift.actionsLeft < actualCost) {
      return { success: false, reason: 'Not enough actions.' };
    }

    if (useEmergencyStop) {
      state.operator.abilities.emergencyStopUsed = true;
      this._log('system', 'Emergency stop used.');
    }

    state.shift.actionsLeft -= actualCost;
    state.elevator.floor = floor;
    state.elevator.stopCount += 1;
    state.elevator.selectedFloor = null;

    // Structural issues curse: every 5th stop → complaint
    if (state.elevator.structuralIssues && state.elevator.stopCount % 5 === 0) {
      this._addComplaint('The building groans. A complaint is filed automatically.');
    }

    // Track stops for Executive
    for (const p of state.elevator.passengers) {
      if (p.archetypeId === 'executive') {
        // don't count the stop at their destination
        if (p.realDest !== floor) {
          p.stopsWhileAboard += 1;
        }
      }
    }

    const dir = typeof floor === 'number' && typeof state.elevator.floor === 'number'
      ? (floor > state.elevator.floor ? '▲' : '▼') : '▼';

    this._log('move', LOG_MESSAGES.moveTo(floor));
    this.emit('moved', { floor, cost: actualCost, dir });

    // Auto-open doors
    this._openDoors(floor);

    return { success: true };
  }

  _openDoors(floor) {
    const { state } = this;
    state.elevator.doorsOpen = true;

    const exiting = this.getExitingAt(floor);
    const waiting = this.getWaitingAt(floor);

    // Kid: if she's in the cab and this isn't her real dest, she might press buttons
    const kidInCab = state.elevator.passengers.find(p => p.archetypeId === 'kid');
    if (kidInCab && !state.shift.stopQueue.includes(floor)) {
      // kid pressed a random unlocked floor button
      const extras = state.building.unlockedFloors.filter(f =>
        f !== floor && f !== kidInCab.realDest && !state.shift.stopQueue.includes(f)
      );
      if (extras.length > 0 && Math.random() < 0.6) {
        const extra = extras[Math.floor(Math.random() * extras.length)];
        state.shift.stopQueue.push(extra);
        kidInCab.buttonsPressed += 1;
        this._log('kid', `The kid presses something. Floor ${extra} lights up on the panel.`);
      }
    }

    this._log('doors', LOG_MESSAGES.doorsOpen());

    state.phase = 'boarding';
    this.emit('doorsOpened', {
      floor,
      exiting,
      waiting,
      floorData: this.getFloorData(floor),
    });
  }

  /**
   * Board a waiting passenger (by id). Returns { success, reason }
   */
  boardPassenger(passengerId) {
    const { state } = this;
    if (!state.elevator.doorsOpen) return { success: false, reason: 'Doors closed.' };

    const passenger = this._findWaiting(passengerId);
    if (!passenger) return { success: false, reason: 'Passenger not found.' };

    if (state.elevator.passengers.length >= state.elevator.capacity) {
      return { success: false, reason: 'Cab at capacity.' };
    }

    // Couple mechanic: check if pair is already in cab
    if (passenger.pairId) {
      const pairInCab = state.elevator.passengers.find(p => p.archetypeId === passenger.pairId);
      if (pairInCab) {
        // They see each other — automatic complaint from both
        passenger.sharedCabWithPair = true;
        pairInCab.sharedCabWithPair = true;
        // Board them briefly so delivery can happen at next floor
        passenger.inCab = true;
        passenger.boardedAtAction = state.shift.actionsLeft;
        state.elevator.passengers.push(passenger);
        this._removeFromWaiting(passengerId);
        this._log('couple', 'They see each other the moment she boards.');
        this.emit('passengerBoarded', { passenger });
        return { success: true };
      }
    }

    passenger.inCab = true;
    passenger.boardedAtAction = state.shift.actionsLeft;
    state.elevator.passengers.push(passenger);
    this._removeFromWaiting(passengerId);

    // Reveal on arrival ability
    const secretRevealed = state.operator.abilities.revealOnArrival || state.operator.abilities.seeAllHidden;

    this._log('board', LOG_MESSAGES.boarded(passenger.name));
    this.emit('passengerBoarded', {
      passenger,
      hiddenRevealed: secretRevealed,
      hiddenText: secretRevealed ? passenger.archetype.hiddenText : null,
    });

    return { success: true };
  }

  /**
   * Refuse a waiting passenger (skip them, they're abandoned).
   */
  refusePassenger(passengerId) {
    const passenger = this._findWaiting(passengerId);
    if (!passenger) return;
    passenger.abandoned = true;
    this._removeFromWaiting(passengerId);
    this.state.shift.abandoned.push(passenger);
    this._log('refuse', LOG_MESSAGES.refused(passenger.name));
    this.emit('passengerRefused', { passenger });
  }

  /**
   * Operator speaks to a passenger currently in the cab.
   */
  speakTo(passengerId) {
    const passenger = this.state.elevator.passengers.find(p => p.id === passengerId);
    if (!passenger) return;
    passenger.spokeTo = true;
    this._log('speak', `You say something to ${passenger.name}.`);
    this.emit('spoke', { passenger });
  }

  /**
   * Open doors at the current floor (free action, 0 cost).
   */
  openDoorsAtCurrentFloor() {
    const { state } = this;
    if (state.shift.ended) return;
    if (state.elevator.doorsOpen) return;
    this._openDoors(state.elevator.floor);
  }

  /**
   * Close the doors and return to shift phase.
   */
  closeDoors() {
    const { state } = this;
    if (!state.elevator.doorsOpen) return;

    // Deliver passengers who want this floor
    const floor = state.elevator.floor;
    const toDeliver = this.getExitingAt(floor);
    for (const p of toDeliver) {
      if (!state.shift.ended) this._deliverPassenger(p);
    }

    state.elevator.doorsOpen = false;
    state.phase = 'shift';

    this._log('doors', LOG_MESSAGES.doorsClose());
    this.emit('doorsClosed', { floor });

    // Auto-end checks (in priority order)
    if (!state.shift.ended && state.shift.complaints >= 3) {
      this._finishShift();
    } else if (!state.shift.ended && state.shift.actionsLeft <= 0) {
      this._endShiftAutomatic();
    }
  }

  _deliverPassenger(passenger) {
    const { state } = this;
    const floor = state.elevator.floor;

    // Remove from cab
    state.elevator.passengers = state.elevator.passengers.filter(p => p.id !== passenger.id);
    passenger.inCab = false;
    passenger.delivered = true;

    // Build delivery context
    const totalDelivered = state.shift.delivered.length;
    const totalPassengers = state.shift.passengers.length;
    const shiftEfficiency = totalPassengers > 0 ? totalDelivered / totalPassengers : 0;
    const actionsLeft = state.shift.actionsLeft;
    const actionsTotal = state.shift.actionsTotal;
    const deliveredInFinalThird = actionsLeft <= Math.floor(actionsTotal / 3);
    const deliveredToSecret = (floor === passenger.actualDestFloor) && (passenger.destFloor !== passenger.actualDestFloor);

    const ctx = {
      floor,
      stopsWhileAboard: passenger.stopsWhileAboard,
      spokeTo: passenger.spokeTo,
      sharedCabWithPair: passenger.sharedCabWithPair,
      deliveredToSecret,
      deliveredInFinalThird,
      shiftEfficiency,
      actionsLeft,
      actionsTotal,
    };

    // Adjust for polished brass (executive tolerance)
    let archetype = passenger.archetype;

    const result = archetype.check(ctx);

    // Learn secret if first time
    if (!state.run.knownSecrets[passenger.archetypeId] && archetype.hiddenText) {
      state.run.knownSecrets[passenger.archetypeId] = true;
      this.emit('secretLearned', { archetypeId: passenger.archetypeId, text: archetype.hiddenText });
    }

    state.shift.delivered.push(passenger);

    if (result.message) {
      this._log('delivery', result.message);
    }

    if (result.complaint) {
      this._addComplaint(LOG_MESSAGES.complaint());
    }

    if (result.tip > 0) {
      state.shift.tips += result.tip;
      state.run.totalTips += result.tip;
      this._log('tip', `$${result.tip}.`);
    }

    if (result.unlockFloor) {
      state.building.unlockFloor(result.unlockFloor);
      this._log('unlock', `A new floor becomes accessible.`);
      this.emit('floorUnlocked', { floor: result.unlockFloor });
    }

    if (result.bonus === 'card_fragment') {
      this.emit('cardFragment', {});
    }

    this.emit('passengerDelivered', { passenger, result });

    return result;
  }

  _addComplaint(message) {
    const { state } = this;
    state.shift.complaints += 1;
    state.run.weekComplaints += 1;
    if (message) this._log('complaint', message);
    this.emit('complaintFiled', { total: state.shift.complaints });

    if (state.shift.complaints >= 3) {
      this._log('system', LOG_MESSAGES.shift3());
      this.emit('shiftForcedEnd', {});
    }
  }

  /**
   * Player manually ends the shift.
   */
  endShift() {
    if (this.state.shift.ended) return;
    this._finishShift();
  }

  _endShiftAutomatic() {
    if (this.state.shift.ended) return;
    this._log('system', LOG_MESSAGES.noActions());
    this._finishShift();
  }

  _finishShift() {
    const { state } = this;
    state.shift.ended = true;
    state.shift.active = false;

    // Abandon anyone still waiting or in cab (left behind)
    for (const p of state.elevator.passengers) {
      if (!p.delivered) {
        p.abandoned = true;
        state.shift.abandoned.push(p);
      }
    }
    state.elevator.passengers = [];

    for (const floor of Object.keys(state.building.waitingAt)) {
      for (const p of (state.building.waitingAt[floor] ?? [])) {
        if (!p.delivered && !p.abandoned) {
          p.abandoned = true;
          state.shift.abandoned.push(p);
        }
      }
    }

    this.emit('shiftEnded', {
      tips: state.shift.tips,
      complaints: state.shift.complaints,
      delivered: state.shift.delivered.length,
      total: state.shift.passengers.length,
    });

    // Move to card selection
    state.phase = 'card-select';
    this.emit('cardSelectBegin', { cards: this._pickCards() });
  }

  // ── Card system ───────────────────────────────────

  _pickCards() {
    const { state } = this;
    const allCards = Object.values(CARDS);

    // Weight: avoid duplicates of already-held cards
    const held = new Set(state.run.cards);
    const pool = allCards.filter(c => !held.has(c.id));

    // If last day has only curses, force one good option — unless it's really Friday
    const dayIndex = state.run.dayIndex;

    // Shuffle and pick 3
    const shuffled = pool.sort(() => Math.random() - 0.5);

    // Ensure at least one curse might appear late week
    let picks = shuffled.slice(0, 3);

    // Guarantee at least one good card on Mon/Tue
    if (dayIndex < 2) {
      picks = picks.filter(c => !c.isCurse);
      const nonCurse = shuffled.filter(c => !c.isCurse);
      picks = nonCurse.slice(0, 3);
    }

    // Pad if needed
    while (picks.length < 3) {
      picks.push(allCards[Math.floor(Math.random() * allCards.length)]);
    }

    return picks.slice(0, 3);
  }

  selectCard(cardId) {
    const { state } = this;
    const card = CARDS[cardId];
    if (!card) return;

    state.run.cards.push(cardId);
    card.effect(state);

    this._log('card', `Card taken: ${card.name}.`);
    this.emit('cardSelected', { card });

    // Advance day
    state.run.dayIndex += 1;

    if (state.run.dayIndex >= 5) {
      this._endWeek();
    } else {
      this._beginDay();
    }
  }

  _endWeek() {
    const { state } = this;
    state.phase = 'week-end';

    const fired = state.run.weekComplaints >= 9;
    state.run.score = state.run.totalTips - (state.run.weekComplaints * 10);

    this.emit('weekEnded', {
      fired,
      score: state.run.score,
      totalTips: state.run.totalTips,
      weekComplaints: state.run.weekComplaints,
      cards: state.run.cards,
      floor30unlocked: state.building.unlockedFloors.includes(30),
    });
  }

  // ── Helpers ───────────────────────────────────────

  _findWaiting(passengerId) {
    for (const arr of Object.values(this.state.building.waitingAt)) {
      const p = arr.find(p => p.id === passengerId);
      if (p) return p;
    }
    return null;
  }

  _removeFromWaiting(passengerId) {
    const { waitingAt } = this.state.building;
    for (const floor of Object.keys(waitingAt)) {
      waitingAt[floor] = waitingAt[floor].filter(p => p.id !== passengerId);
    }
  }

  _log(type, message) {
    if (!message) return;
    const { state } = this;
    state.shift.log.push({ type, message });
    this.emit('log', { type, message });
  }

  /** Expose a snapshot for UI (avoid direct mutation) */
  snapshot() {
    const { state } = this;
    return {
      phase: state.phase,
      day: DAYS[state.run.dayIndex] ?? 'Friday',
      dayIndex: state.run.dayIndex,
      floor: state.elevator.floor,
      selectedFloor: state.elevator.selectedFloor,
      actionsLeft: state.shift.actionsLeft,
      actionsTotal: state.shift.actionsTotal,
      complaints: state.shift.complaints,
      tips: state.shift.tips,
      capacity: state.elevator.capacity,
      speed: state.elevator.speed,
      condition: state.elevator.condition,
      doorsOpen: state.elevator.doorsOpen,
      stopCount: state.elevator.stopCount,
      unlockedFloors: [...state.building.unlockedFloors],
      waitingAt: state.building.waitingAt,
      cabPassengers: [...state.elevator.passengers],
      stopQueue: [...state.shift.stopQueue],
      log: [...state.shift.log],
      abilities: { ...state.operator.abilities },
      knownSecrets: { ...state.run.knownSecrets },
      weekComplaints: state.run.weekComplaints,
      totalTips: state.run.totalTips,
      cards: [...state.run.cards],
    };
  }
}
