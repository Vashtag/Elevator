// ─────────────────────────────────────────────
//  GOING UP  ·  Static Game Data
// ─────────────────────────────────────────────

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ── Passenger Archetypes ──────────────────────────────────────────────────────

export const ARCHETYPES = {

  executive: {
    id: 'executive',
    name: 'The Executive',
    visible: 'Always going up',
    hiddenText: 'Hates waiting more than 2 stops',
    sprite: '◆',
    color: '#B8965A',
    learnedMessage: 'He checks his watch before saying where he\'s going.',
    /**
     * @param {object} ctx  delivery context
     * @param {number} ctx.stopsWhileAboard  stops made with exec in cab (excl. board floor)
     * @param {boolean} ctx.secretRevealed
     */
    check(ctx) {
      if (ctx.stopsWhileAboard > 2) {
        return {
          met: false,
          complaint: true,
          tip: 0,
          message: '"Two stops. Then a third." He doesn\'t look at you. "I won\'t forget this."',
        };
      }
      return {
        met: true,
        complaint: false,
        tip: 20,
        message: 'A crisp bill, placed on the rail without eye contact.',
      };
    },
  },

  kid: {
    id: 'kid',
    name: 'The Kid',
    visible: 'Presses every button',
    hiddenText: 'Is actually going to a secret floor',
    sprite: '●',
    color: '#6B8E9F',
    learnedMessage: 'She presses B before the doors are fully open.',
    secretFloor: 13,
    /**
     * @param {object} ctx
     * @param {boolean} ctx.deliveredToSecret  took her to the secret floor
     * @param {number}  ctx.buttonsPressed     extra button-presses she made
     */
    check(ctx) {
      if (ctx.deliveredToSecret) {
        return {
          met: true,
          complaint: false,
          tip: 40,
          message: 'The kid grins. Something clicks into place in the panel.',
          unlockFloor: 13,
        };
      }
      return {
        met: false,
        complaint: false,
        tip: 5,
        message: 'The kid exits looking back over her shoulder. You knew. You didn\'t say anything.',
      };
    },
  },

  grievingWoman: {
    id: 'grievingWoman',
    name: 'The Grieving Woman',
    visible: 'Floor 4',
    hiddenText: 'Tips double if you say nothing',
    sprite: '◈',
    color: '#7A7080',
    learnedMessage: 'She boards without making eye contact. Her floor is always four.',
    /**
     * @param {object} ctx
     * @param {boolean} ctx.spokeTo  operator used SPEAK action while she was aboard
     */
    check(ctx) {
      if (ctx.spokeTo) {
        return {
          met: false,
          complaint: false,
          tip: 10,
          message: 'She nods, briefly. Something has shifted in the air.',
        };
      }
      return {
        met: true,
        complaint: false,
        tip: 24,
        message: 'She presses a folded twenty into your palm without turning around. Then she\'s gone.',
      };
    },
  },

  inspector: {
    id: 'inspector',
    name: 'The Inspector',
    visible: 'Observing everything',
    hiddenText: 'Grades efficiency, not speed',
    sprite: '◎',
    color: '#8B9B8A',
    learnedMessage: 'He boards with a clipboard already open.',
    /**
     * @param {object} ctx
     * @param {number} ctx.shiftEfficiency  0–1, proportion of shift passengers delivered so far
     */
    check(ctx) {
      if (ctx.shiftEfficiency >= 0.75) {
        return {
          met: true,
          complaint: false,
          tip: 15,
          bonus: 'card_fragment',
          message: '"Satisfactory." He marks something. Tears a small slip from his notebook and hands it to you.',
        };
      }
      return {
        met: false,
        complaint: true,
        tip: 0,
        message: '"Below average. You\'ll be hearing from the building." He marks something else.',
      };
    },
  },

  coupleA: {
    id: 'coupleA',
    name: 'The Couple (Her)',
    visible: 'Entered separately',
    hiddenText: 'Cannot share the cab',
    sprite: '◉',
    color: '#8C7B8C',
    pairId: 'coupleB',
    learnedMessage: 'She boards first. She always boards first.',
    check(ctx) {
      if (ctx.sharedCabWithPair) {
        return {
          met: false,
          complaint: true,
          tip: 0,
          message: 'They see each other. Something terrible and quiet passes between them. She presses the button for the next floor. He follows. Neither looks at you.',
        };
      }
      return {
        met: true,
        complaint: false,
        tip: 12,
        message: 'She exits. The floor holds the shape of something unsaid.',
      };
    },
  },

  coupleB: {
    id: 'coupleB',
    name: 'The Couple (Him)',
    visible: 'Entered separately',
    hiddenText: 'Cannot share the cab',
    sprite: '◉',
    color: '#7B6B8C',
    pairId: 'coupleA',
    learnedMessage: 'He boards second. He always boards second.',
    check(ctx) {
      if (ctx.sharedCabWithPair) {
        return { met: false, complaint: true, tip: 0, message: null }; // pair already showed message
      }
      return {
        met: true,
        complaint: false,
        tip: 12,
        message: 'He doesn\'t look at you on the way out. That\'s fine.',
      };
    },
  },

  nightWorker: {
    id: 'nightWorker',
    name: 'The Night Worker',
    visible: 'Going home late',
    hiddenText: 'Unlocks a new floor if the last delivery of the night',
    sprite: '◌',
    color: '#4A5C6A',
    learnedMessage: 'He boards without pressing anything. You already know.',
    /**
     * @param {object} ctx
     * @param {boolean} ctx.deliveredInFinalThird  delivered when ≤ 1/3 actions remained
     */
    check(ctx) {
      if (ctx.deliveredInFinalThird) {
        return {
          met: true,
          complaint: false,
          tip: 30,
          unlockFloor: 11,
          message: 'He leaves something wedged in the panel seam. A key, or something like one. A button you haven\'t seen before.',
        };
      }
      return {
        met: false,
        complaint: false,
        tip: 8,
        message: 'He nods on the way out. Same time tomorrow.',
      };
    },
  },

  worker: {
    id: 'worker',
    name: 'Office Worker',
    visible: 'Looking at their phone',
    hiddenText: null,
    sprite: '○',
    color: '#7A7060',
    learnedMessage: 'Still on the same call.',
    check(_ctx) {
      return {
        met: true,
        complaint: false,
        tip: 8,
        message: 'They exit still looking at their phone.',
      };
    },
  },

};

// ── Floor Data ────────────────────────────────────────────────────────────────

export const FLOORS = {
  basement: {
    id: 'basement',
    label: 'B',
    name: 'The Basement',
    description: 'Below the lobby. The lights are fluorescent and one of them flickers. There is a drain in the center of the floor.',
    color: '#1A1A1A',
    textColor: '#666666',
    locked: true,
  },
  1: {
    id: 1,
    label: '01',
    name: 'The Lobby',
    description: 'Marble that hasn\'t been warm since the building was new. A potted fern is dying, slowly and without drama.',
    color: '#2A2018',
    textColor: '#C8A878',
    locked: false,
  },
  2: {
    id: 2,
    label: '02',
    name: 'Corporate Law',
    description: 'The sound of a fax machine no one uses anymore. Carpet the color of a bruise.',
    color: '#1E1E28',
    textColor: '#9898B8',
    locked: false,
  },
  3: {
    id: 3,
    label: '03',
    name: 'Insurance',
    description: 'The smell of burned coffee and something that might once have been ambition.',
    color: '#201A18',
    textColor: '#B09880',
    locked: false,
  },
  4: {
    id: 4,
    label: '04',
    name: 'Records',
    description: 'Everything that happened is written down here. The dust is thicker than elsewhere.',
    color: '#1C1C1C',
    textColor: '#A0A0A0',
    locked: false,
  },
  5: {
    id: 5,
    label: '05',
    name: 'Sales',
    description: 'Motivational posters. A whiteboard with a target number that keeps getting higher. Someone is laughing at something that isn\'t funny.',
    color: '#221810',
    textColor: '#C09050',
    locked: false,
  },
  6: {
    id: 6,
    label: '06',
    name: 'Finance',
    description: 'Quiet as a library. A little cold. Sunlight comes in filtered through blinds and lands in strips on the carpet.',
    color: '#181E22',
    textColor: '#8098A8',
    locked: false,
  },
  7: {
    id: 7,
    label: '07',
    name: 'Seven',
    description: 'Something is being packed into boxes. Again. Whether they are coming or going is never clear.',
    color: '#201A1A',
    textColor: '#A08080',
    locked: false,
  },
  8: {
    id: 8,
    label: '08',
    name: 'Accounting',
    description: 'The floor smells of old paper. A window is cracked open. Outside, a pigeon.',
    color: '#1A1E18',
    textColor: '#90A880',
    locked: false,
  },
  9: {
    id: 9,
    label: '09',
    name: 'Executive Suites',
    description: 'The carpet is different here. Thicker. The air has been adjusted.',
    color: '#1E1A10',
    textColor: '#C0A060',
    locked: false,
  },
  10: {
    id: 10,
    label: '10',
    name: 'The Threshold',
    description: 'The ceiling seems lower here, or you seem taller. The button for floor 11 is unmarked.',
    color: '#20180A',
    textColor: '#C08040',
    locked: false,
    isBoss: true,
  },
  11: { id: 11, label: '11', name: 'Eleven', description: 'A storage floor. Shapes under drop cloths. You don\'t lift any of them.', color: '#181818', textColor: '#808080', locked: true },
  12: { id: 12, label: '12', name: 'Twelve', description: 'It appears to be a waiting room. No appointments are listed.', color: '#181818', textColor: '#808080', locked: true },
  13: { id: 13, label: '13', name: 'Thirteen', description: 'The kid was right. There is something here, just for her.', color: '#101820', textColor: '#6080A0', locked: true },
  14: { id: 14, label: '14', name: 'Fourteen', description: 'You smell the ocean before the doors are open. Salt. The sound of water somewhere below the floor.', color: '#101A20', textColor: '#6090B0', locked: true },
  20: { id: 20, label: '20', name: 'Twenty', description: 'The second threshold. Three passengers want this floor. None of them can share the ride.', color: '#201010', textColor: '#A05050', locked: true, isBoss: true },
  21: { id: 21, label: '21', name: 'Twenty-One', description: 'The button lights when you press it. The floor is dark. Something moves near the far wall.', color: '#080808', textColor: '#404040', locked: true },
  30: { id: 30, label: '30', name: 'Thirty', description: 'You have been here the whole time, in a way. One passenger. No request. You choose where they go. Everything changes.', color: '#100808', textColor: '#804040', locked: true, isFinalBoss: true },
};

export const STARTING_FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Card Pool ─────────────────────────────────────────────────────────────────

export const CARDS = {

  // Elevator Upgrades
  hydraulicBoost: {
    id: 'hydraulicBoost',
    category: 'upgrade',
    name: 'Hydraulic Boost',
    desc: 'Speed increases to 2. Each action moves 2 floors.',
    flavor: 'Something was replaced in the shaft. You don\'t ask what.',
    effect: (state) => { state.elevator.speed = Math.max(state.elevator.speed, 2); },
  },
  expandCab: {
    id: 'expandCab',
    category: 'upgrade',
    name: 'Expand the Cab',
    desc: 'Capacity increases by 1.',
    flavor: 'A folding seat appears. You don\'t remember installing it.',
    effect: (state) => { state.elevator.capacity += 1; },
  },
  emergencyStop: {
    id: 'emergencyStop',
    category: 'upgrade',
    name: 'Emergency Stop',
    desc: 'Once per shift, stopping at a floor costs 0 actions.',
    flavor: 'The red handle. You\'ve always wondered.',
    effect: (state) => { state.operator.abilities.emergencyStop = true; },
  },
  polishedBrass: {
    id: 'polishedBrass',
    category: 'upgrade',
    name: 'Polished Brass',
    desc: 'Passengers board in a slightly better mood. Executive patience increases to 3 stops.',
    flavor: 'The doors catch the light differently now.',
    effect: (state) => { state.elevator.polishedBrass = true; },
  },
  extraBudget: {
    id: 'extraBudget',
    category: 'upgrade',
    name: 'Double Shift',
    desc: 'Action budget increases by 5 for remaining days.',
    flavor: 'Management has noticed your dedication.',
    effect: (state) => { state.run.actionBonusPerDay += 5; },
  },

  // Operator Skills
  readTheRoom: {
    id: 'readTheRoom',
    category: 'skill',
    name: 'Read the Room',
    desc: 'Reveal each passenger\'s hidden trait when they board.',
    flavor: 'Twenty years. You see it now.',
    effect: (state) => { state.operator.abilities.revealOnArrival = true; },
  },
  twentyYears: {
    id: 'twentyYears',
    category: 'skill',
    name: 'Twenty Years in the Business',
    desc: 'All hidden traits are visible before the shift begins.',
    flavor: 'You\'ve seen every type. Twice.',
    effect: (state) => { state.operator.abilities.seeAllHidden = true; },
  },
  steadyHands: {
    id: 'steadyHands',
    category: 'skill',
    name: 'Steady Hands',
    desc: 'Jammed buttons no longer waste extra actions.',
    flavor: 'You learned to feel when the panel lies.',
    effect: (state) => { state.operator.abilities.ignoreJammed = true; },
  },
  theyAlwaysLie: {
    id: 'theyAlwaysLie',
    category: 'skill',
    name: 'They Always Lie',
    desc: 'You can see where passengers actually want to go vs. what they say.',
    flavor: 'Floor 4, they say. Floor 4.',
    effect: (state) => { state.operator.abilities.knowActual = true; },
  },

  // Building Access
  masterKey: {
    id: 'masterKey',
    category: 'access',
    name: 'Master Key',
    desc: 'Unlocks floors 11–14.',
    flavor: 'A brass key on a hook you hadn\'t noticed before.',
    effect: (state) => { [11, 12, 13, 14].forEach(f => state.building.unlockFloor(f)); },
  },
  maintenanceDoor: {
    id: 'maintenanceDoor',
    category: 'access',
    name: 'The Maintenance Door',
    desc: 'Unlocks the basement.',
    flavor: 'The key is warm. It shouldn\'t be.',
    effect: (state) => { state.building.unlockFloor('basement'); },
  },
  goldCard: {
    id: 'goldCard',
    category: 'access',
    name: 'The Gold Card',
    desc: 'Once per shift, summon a high-tip VIP passenger from the lobby.',
    flavor: 'Someone left it on the rail. No name on it.',
    effect: (state) => { state.operator.abilities.summonVIP = true; },
  },

  // Curses (sometimes all three are bad)
  wordGetsOut: {
    id: 'wordGetsOut',
    category: 'curse',
    name: 'Word Gets Out',
    desc: 'Two extra passengers per remaining shift. No extra time.',
    flavor: 'You are, apparently, very good at this.',
    isCurse: true,
    effect: (state) => { state.run.extraPassengersPerDay += 2; },
  },
  underReview: {
    id: 'underReview',
    category: 'curse',
    name: 'Under Review',
    desc: 'The Inspector appears in every remaining shift.',
    flavor: '"Don\'t mind me." He says this every time.',
    isCurse: true,
    effect: (state) => { state.run.forceInspector = true; },
  },
  structuralIssues: {
    id: 'structuralIssues',
    category: 'curse',
    name: 'Structural Issues',
    desc: 'Every 5th stop, an automatic complaint is filed.',
    flavor: 'The building is old. You are part of the building.',
    isCurse: true,
    effect: (state) => { state.elevator.structuralIssues = true; },
  },

};

// ── Shift Schedules ───────────────────────────────────────────────────────────
// Each entry: { archetype, boardFloor, destFloor, statedDestFloor? }
// statedDestFloor is what they say if different from actual (kid mechanic, etc.)

export const SHIFT_SCHEDULES = [

  // Day 0 — Monday: First encounters, 4 passengers
  [
    { archetype: 'grievingWoman', boardFloor: 1, destFloor: 4 },
    { archetype: 'executive',    boardFloor: 1, destFloor: 9 },
    { archetype: 'worker',       boardFloor: 2, destFloor: 7 },
    { archetype: 'worker',       boardFloor: 3, destFloor: 6 },
  ],

  // Day 1 — Tuesday: 5 passengers, one regular returns
  [
    { archetype: 'grievingWoman', boardFloor: 1, destFloor: 4 },
    { archetype: 'worker',        boardFloor: 1, destFloor: 8 },
    { archetype: 'executive',     boardFloor: 2, destFloor: 9 },
    { archetype: 'kid',           boardFloor: 3, destFloor: 5, actualDestFloor: 13 },
    { archetype: 'worker',        boardFloor: 5, destFloor: 10 },
  ],

  // Day 2 — Wednesday: 6 passengers, Inspector appears
  [
    { archetype: 'worker',        boardFloor: 1, destFloor: 6 },
    { archetype: 'grievingWoman', boardFloor: 1, destFloor: 4 },
    { archetype: 'kid',           boardFloor: 2, destFloor: 5, actualDestFloor: 13 },
    { archetype: 'inspector',     boardFloor: 3, destFloor: 8 },
    { archetype: 'executive',     boardFloor: 4, destFloor: 10 },
    { archetype: 'worker',        boardFloor: 6, destFloor: 9 },
  ],

  // Day 3 — Thursday: 7 passengers, The Couple appears
  [
    { archetype: 'grievingWoman', boardFloor: 1, destFloor: 4 },
    { archetype: 'coupleA',       boardFloor: 1, destFloor: 8 },
    { archetype: 'worker',        boardFloor: 2, destFloor: 5 },
    { archetype: 'coupleB',       boardFloor: 2, destFloor: 8 },
    { archetype: 'executive',     boardFloor: 3, destFloor: 9 },
    { archetype: 'inspector',     boardFloor: 5, destFloor: 10 },
    { archetype: 'kid',           boardFloor: 6, destFloor: 5, actualDestFloor: 13 },
  ],

  // Day 4 — Friday: 8 passengers, Night Worker, potential boss
  [
    { archetype: 'nightWorker',   boardFloor: 4, destFloor: 1 },
    { archetype: 'grievingWoman', boardFloor: 1, destFloor: 4 },
    { archetype: 'coupleA',       boardFloor: 2, destFloor: 7 },
    { archetype: 'coupleB',       boardFloor: 3, destFloor: 7 },
    { archetype: 'executive',     boardFloor: 4, destFloor: 9 },
    { archetype: 'kid',           boardFloor: 5, destFloor: 5, actualDestFloor: 13 },
    { archetype: 'inspector',     boardFloor: 6, destFloor: 10 },
    { archetype: 'worker',        boardFloor: 8, destFloor: 3 },
  ],

];

// ── Tip messages (flavor) ─────────────────────────────────────────────────────

export const LOG_MESSAGES = {
  moveTo:     (f) => `Floor ${f === 'basement' ? 'B' : f}.`,
  noActions:  ()  => 'The action budget is spent.',
  doorsOpen:  ()  => 'The doors open.',
  doorsClose: ()  => 'The doors close.',
  boarded:    (n) => `${n} steps in.`,
  refused:    (n) => `${n} is left waiting.`,
  delivered:  (n) => `${n} exits at this floor.`,
  complaint:  ()  => 'A complaint is filed.',
  shift3:     ()  => 'Three complaints. The shift is over.',
  weekEnd:    ()  => 'Friday. End of the week.',
};
