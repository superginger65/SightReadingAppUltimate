// ============================================================
// Sight Reading Generator for Classical Guitar — WITH RECORDING & SCORING
// Year 2 Level 4 — Chord Strumming in 6/8 (Pop & Blues)
// Uses ABCjs for notation, Web Audio API for pitch detection (YIN)
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // 1. MUSIC THEORY DATA — CHORDS, STRUM PATTERNS, FLOOR PLANS
  // ==========================================================

  const NOTE_NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
  const FLAT_NAMES = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];

  // Chord voicings: playback tones (MIDI) and pitch-classes for scoring
  const CHORD_DEFS = {
    "Em":    { display: "Em",    tones: [52, 59, 64, 67, 71, 76], pcs: [4, 7, 11] },
    "Cmaj7": { display: "Cmaj7", tones: [60, 64, 67, 71],         pcs: [0, 4, 7, 11] },
    "A9":    { display: "A9",    tones: [57, 61, 64, 67, 71],     pcs: [9, 1, 4, 7, 11] },
    "D":     { display: "D",     tones: [62, 66, 69, 74],         pcs: [2, 6, 9] },
    "E7":    { display: "E7",    tones: [52, 64, 68, 71, 74],     pcs: [4, 8, 11, 2] },
    "A7":    { display: "A7",    tones: [57, 61, 64, 67],         pcs: [9, 1, 4, 7] },
    "B7":    { display: "B7",    tones: [59, 63, 66, 69],         pcs: [11, 3, 6, 9] },
    "E13":   { display: "E13",  tones: [52, 64, 68, 73, 74],     pcs: [4, 8, 11, 1, 2] },
  };

  // Display pitch for notation: B4 (middle line of treble clef) for all strums
  const STRUM_DISPLAY_PITCH = 71;

  // Style definitions (replacing KEY_DEFS for the key selector)
  const STYLE_DEFS = {
    "Pop":   { abcKey: "C", usesFlats: false, label: "Pop" },
    "Blues": { abcKey: "C", usesFlats: false, label: "Blues" },
  };

  // ----------------------------------------------------------
  // Strum rhythm patterns — durations in quarter-beat units
  // 6/8 measure = 3 quarter beats (6 eighths)
  // eighth=0.5, quarter=1, dotted-quarter=1.5, dotted-half=3
  // ----------------------------------------------------------

  const POP_PATTERNS = {
    A: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    B: [1.0, 0.5, 1.0, 0.5],
    C: [0.5, 0.5, 1.0, 0.5, 0.5],
    D: [0.5, 0.5, 0.5, 1.5],
    E: [1.5, 1.0, 0.5],
    F: [1.0, 0.5, 1.5],
    G: [1.5, 1.5],
    H: [0.5, 1.0, 1.5],
    I: [1.0, 1.0, 1.0],
    J: [3.0],
  };

  const BLUES_PATTERNS = {
    A: [0.5, 1.0, 0.5, 1.0],
    B: [1.0, 0.5, 1.5],
    C: [0.5, 0.5, 0.5, 0.5, 1.0],
    D: [1.5, 1.5],
    E: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    F: [0.5, 0.5, 0.5, 1.0, 0.5],
    G: [1.0, 0.5, 0.5, 0.5, 0.5],
    H: [1.5, 1.0, 0.5],
    I: [3.0],
  };

  // ----------------------------------------------------------
  // Harmonic floor plans — 16 measures each
  // Each entry: { chord: "name", patterns: ["A","B",...] }
  // ----------------------------------------------------------

  const POP_FLOOR_PLAN = [
    { chord: "Em",    patterns: ["A","B","C","D","E"] },
    { chord: "Em",    patterns: ["C","D","E","F"] },
    { chord: "A9",    patterns: ["A","B","C","D","E"] },
    { chord: "A9",    patterns: ["E","F","G","H","I"] },
    { chord: "Em",    patterns: ["A","B","C","D","E"] },
    { chord: "Em",    patterns: ["C","D","E","F"] },
    { chord: "Cmaj7", patterns: ["A","B","C","D","E"] },
    { chord: "Cmaj7", patterns: ["E","F","G","H","I"] },
    { chord: "Em",    patterns: ["A","B","C","D","E"] },
    { chord: "Em",    patterns: ["C","D","E","F"] },
    { chord: "D",     patterns: ["E","F","G","H","I"] },
    { chord: "D",     patterns: ["E","F","G","H","I"] },
    { chord: "Cmaj7", patterns: ["D","E","F","H"] },
    { chord: "A9",    patterns: ["D","E","F","H","I"] },
    { chord: "Em",    patterns: ["A","B","C","G"] },
    { chord: "Em",    patterns: ["H","J"] },
  ];

  const BLUES_FLOOR_PLAN_BASE = [
    { chord: "E7", patterns: ["A","B","C","D","E"] },
    { chord: "E7", patterns: ["A","B","C","D","E"] },
    { chord: "A7", patterns: ["A","B","C","D","E"] },
    { chord: "A7", patterns: ["B","C","H"] },
    { chord: "E7", patterns: ["A","B","C","D","E"] },
    { chord: "E7", patterns: ["B","C","H"] },
    { chord: "B7", patterns: ["F","G","C","D"] },
    { chord: "B7", patterns: ["B","C","H"] },
    { chord: "E7", patterns: ["A","B","C","D","E"] },
    { chord: "E7", patterns: ["A","B","C","D","E"] },
    { chord: "A7", patterns: ["A","B","C","D","E"] },
    { chord: "A7", patterns: ["B","C","H"] },
  ];

  const BLUES_ENDINGS = [
    // Alt 1: E7 → B7 → E7 → E7
    [
      { chord: "E7", patterns: ["A","B","C","D","E"] },
      { chord: "B7", patterns: ["B","C","H"] },
      { chord: "E7", patterns: ["A","B","C","D","E"] },
      { chord: "E7", patterns: ["I"] },
    ],
    // Alt 2: B7 → E13 → E7 → E7
    [
      { chord: "B7", patterns: ["B","C","H"] },
      { chord: "E13", patterns: ["D","H","B"] },
      { chord: "E7", patterns: ["A","B","C","D","E"] },
      { chord: "E7", patterns: ["I"] },
    ],
    // Alt 3: B7 → B7 → E7 → E7
    [
      { chord: "B7", patterns: ["F","G","C","D"] },
      { chord: "B7", patterns: ["B","C","H"] },
      { chord: "E7", patterns: ["A","B","C","D","E"] },
      { chord: "E7", patterns: ["I"] },
    ],
    // Alt 4: B7 → B7 → E13 → E7 (E13 cadence variant)
    [
      { chord: "B7", patterns: ["F","G","C","D"] },
      { chord: "B7", patterns: ["B","C","H"] },
      { chord: "E13", patterns: ["D","H","B"] },
      { chord: "E7", patterns: ["I"] },
    ],
  ];

  // ==========================================================
  // 1b. SEEDED PSEUDO-RANDOM NUMBER GENERATOR
  // ==========================================================

  let _prngState = 0;

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }

  function seedPRNG(seedStr) {
    _prngState = hashString(seedStr);
    if (_prngState === 0) _prngState = 1;
  }

  function seededRandom() {
    _prngState |= 0;
    _prngState = (_prngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_prngState ^ (_prngState >>> 15), 1 | _prngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  let lastUsedSeed = "";

  function incrementSeed(seed) {
    const match = seed.match(/^(.*-)?(\d+)$/);
    if (match && match[1]) return match[1] + (parseInt(match[2], 10) + 1);
    return seed + "-2";
  }

  // ==========================================================
  // 2. PITCH UTILITIES
  // ==========================================================

  function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
  }

  function midiToNoteName(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const note = names[Math.round(midi) % 12];
    const oct = Math.floor(Math.round(midi) / 12) - 1;
    return note + oct;
  }

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ==========================================================
  // 3. MELODY GENERATION (chord strum exercise)
  // ==========================================================

  // Store chord info per measure for scoring
  let currentMeasureChords = [];

  function buildBluesFloorPlan() {
    const ending = BLUES_ENDINGS[Math.floor(seededRandom() * BLUES_ENDINGS.length)];
    return BLUES_FLOOR_PLAN_BASE.concat(ending);
  }

  function generateMelody(styleName, meter, difficulty, numMeasures) {
    const floorPlan = styleName === "Blues" ? buildBluesFloorPlan() : POP_FLOOR_PLAN;
    const patternLib = styleName === "Blues" ? BLUES_PATTERNS : POP_PATTERNS;
    const measures = [];
    currentMeasureChords = [];

    for (let m = 0; m < numMeasures; m++) {
      const slot = floorPlan[m % floorPlan.length];
      const chordName = slot.chord;
      const chordDef = CHORD_DEFS[chordName];
      const allowedPatterns = slot.patterns;

      // Pick a random pattern from allowed set
      const patKey = allowedPatterns[Math.floor(seededRandom() * allowedPatterns.length)];
      const durations = patternLib[patKey];

      currentMeasureChords.push(chordName);

      const notes = [];
      let dirToggle = 0;
      for (let i = 0; i < durations.length; i++) {
        const dur = durations[i];
        const hasUpVariant = dur === 0.5 || dur === 1.0;
        const strumDir = hasUpVariant ? (dirToggle % 2 === 0 ? "D" : "U") : "D";
        dirToggle++;
        notes.push({
          pitch: STRUM_DISPLAY_PITCH,
          duration: dur,
          isRest: false,
          chordName: chordName,
          chordPCs: chordDef.pcs,
          showChord: i === 0,
          strumDir: strumDir,
        });
      }
      measures.push(notes);
    }

    return measures;
  }

  // ==========================================================
  // 4. ABC CONVERSION & RENDERING
  // ==========================================================

  function midiToAbc(midi, styleDef) {
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const names = styleDef.usesFlats ? FLAT_NAMES : NOTE_NAMES;
    let name = names[noteIndex];
    let baseLetter = name.replace(/[\^_=]/g, "");
    let accidental = name.replace(baseLetter, "");
    if (octave >= 5) {
      baseLetter = baseLetter.toLowerCase();
      return accidental + baseLetter + "'".repeat(octave - 5);
    } else {
      baseLetter = baseLetter.toUpperCase();
      const commas = 4 - octave;
      return commas > 0 ? accidental + baseLetter + ",".repeat(commas) : accidental + baseLetter;
    }
  }

  function durationToAbc(dur) {
    const eighths = dur * 2;
    if (eighths === 1) return "";
    if (eighths === 2) return "2";
    if (eighths === 3) return "3";
    if (eighths === 4) return "4";
    if (eighths === 6) return "6";
    if (eighths === 8) return "8";
    if (eighths < 1) return "/" + Math.round(1 / eighths);
    return String(Math.round(eighths));
  }

  function melodyToAbc(measures, styleDef, meter) {
    let abc = "X:1\nM:" + meter + "\nL:1/8\n%%stretchlast true\nK:" + styleDef.abcKey + " style=rhythm\n";

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      let beatPosEighths = 0;

      for (let j = 0; j < measure.length; j++) {
        const note = measure[j];
        const durEighths = Math.round(note.duration * 2);

        if (note.showChord) {
          abc += '"' + note.chordName + '"';
        }

        if (note.isRest) {
          abc += "z" + durationToAbc(note.duration);
        } else {
          let noteAbc = midiToAbc(note.pitch, styleDef);
          abc += noteAbc + durationToAbc(note.duration);
        }

        // Beaming: beam sub-beat eighths within compound beat groups (groups of 3 eighths)
        const nextNote = measure[j + 1];
        if (nextNote) {
          const nextBeatPosEighths = beatPosEighths + durEighths;
          const nextDurEighths = Math.round(nextNote.duration * 2);
          const isSubBeat = durEighths < 3;
          const nextIsSubBeat = nextDurEighths < 3;

          let sameGroup = false;
          if (isSubBeat && nextIsSubBeat) {
            const curGroup = Math.floor(beatPosEighths / 3);
            const nextGroup = Math.floor(nextBeatPosEighths / 3);
            sameGroup = curGroup === nextGroup;
          }

          if (!sameGroup) abc += " ";
        }

        beatPosEighths += durEighths;
      }

      if (i === measures.length - 1) abc += "|]";
      else if ((i + 1) % 4 === 0) abc += "|\n";
      else abc += "| ";
    }
    return abc;
  }

  // BPM = dotted-quarter (compound beat) BPM
  function buildExpectedNotes(measures, bpm, meter) {
    const secPerQuarterBeat = 40 / bpm;
    const notes = [];
    let time = 0;

    for (const measure of measures) {
      for (const note of measure) {
        if (note.isRest) {
          notes.push({
            isRest: true,
            midi: null,
            name: "rest",
            startTime: time,
            duration: note.duration * secPerQuarterBeat,
            quarterBeats: note.duration,
            chordPCs: note.chordPCs || [],
            chordName: note.chordName || "",
          });
        } else if (note.pitch != null) {
          notes.push({
            midi: note.pitch,
            name: midiToNoteName(note.pitch),
            startTime: time,
            duration: note.duration * secPerQuarterBeat,
            quarterBeats: note.duration,
            chordPCs: note.chordPCs || [],
            chordName: note.chordName || "",
            strumDir: note.strumDir || "D",
          });
        }
        time += note.duration * secPerQuarterBeat;
      }
    }
    return notes;
  }

  function buildNoteIndexMap(measures) {
    const map = [];
    let idx = 0;
    for (const measure of measures) {
      for (const note of measure) {
        if (!note.isRest && note.pitch != null) {
          map.push(idx++);
        } else {
          map.push(-1);
        }
      }
    }
    return map;
  }

  let lastRenderedTune = null;
  let currentStrumDirs = [];

  function buildStrumDirList(measures) {
    const dirs = [];
    for (const measure of measures) {
      for (const note of measure) {
        if (!note.isRest && note.pitch != null) {
          dirs.push(note.strumDir || "D");
        }
      }
    }
    return dirs;
  }

  function render(abcString) {
    const el = document.getElementById("notation");
    el.innerHTML = "";
    const tuneArr = ABCJS.renderAbc(el, abcString, {
      responsive: "resize",
      staffwidth: 900,
      wrap: { minSpacing: 1.5, maxSpacing: 2.8, preferredMeasuresPerLine: 4 },
      paddingtop: 10, paddingbottom: (window.innerWidth <= 600 ? 5 : window.innerWidth <= 1024 ? 10 : 20), paddingleft: 20, paddingright: 20,
      scale: 1.3,
      add_classes: true,
    });
    lastRenderedTune = tuneArr && tuneArr[0];
    addStrumArrows();
  }

  function addStrumArrows() {
    const container = document.getElementById("notation");
    if (!container) return;
    container.querySelectorAll(".strum-arrow").forEach(function (a) { a.remove(); });

    const svg = container.querySelector("svg");
    if (!svg) return;

    const noteEls = container.querySelectorAll(".abcjs-note");
    const dirs = currentStrumDirs;
    const arrowLen = 12;
    const headSize = 3.5;
    const gapAboveHead = 8;

    for (let i = 0; i < noteEls.length && i < dirs.length; i++) {
      const el = noteEls[i];
      const dir = dirs[i];

      const notehead = el.querySelector(".abcjs-notehead");
      if (!notehead) continue;
      const nhBox = notehead.getBBox();
      const cx = nhBox.x + nhBox.width / 2;

      const chordEl = el.querySelector(".abcjs-chord");
      var arrowBottom;
      if (chordEl) {
        const chordBox = chordEl.getBBox();
        arrowBottom = chordBox.y + chordBox.height + 2 + arrowLen;
      } else {
        arrowBottom = nhBox.y - gapAboveHead;
      }
      const arrowTop = arrowBottom - arrowLen;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "strum-arrow");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "#333");
      line.setAttribute("stroke-width", "1.2");
      g.appendChild(line);

      const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
      head.setAttribute("stroke", "#333");
      head.setAttribute("stroke-width", "1.2");
      head.setAttribute("fill", "none");
      g.appendChild(head);

      if (dir === "D") {
        line.setAttribute("x1", cx);
        line.setAttribute("y1", arrowTop);
        line.setAttribute("x2", cx);
        line.setAttribute("y2", arrowBottom);
        head.setAttribute("d",
          "M" + (cx - headSize) + "," + (arrowBottom - headSize) +
          " L" + cx + "," + arrowBottom +
          " L" + (cx + headSize) + "," + (arrowBottom - headSize));
      } else {
        line.setAttribute("x1", cx);
        line.setAttribute("y1", arrowBottom);
        line.setAttribute("x2", cx);
        line.setAttribute("y2", arrowTop);
        head.setAttribute("d",
          "M" + (cx - headSize) + "," + (arrowTop + headSize) +
          " L" + cx + "," + arrowTop +
          " L" + (cx + headSize) + "," + (arrowTop + headSize));
      }

      svg.appendChild(g);
    }
  }

  // ==========================================================
  // 7. YIN PITCH DETECTION ALGORITHM
  // ==========================================================

  function detectPitchYIN(buffer, sampleRate) {
    const bufSize = buffer.length;
    const halfSize = Math.floor(bufSize / 2);
    const yinBuf = new Float32Array(halfSize);

    for (let tau = 0; tau < halfSize; tau++) {
      yinBuf[tau] = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuf[tau] += delta * delta;
      }
    }

    yinBuf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuf[tau];
      yinBuf[tau] *= tau / runningSum;
    }

    const threshold = 0.15;
    let tau;
    for (tau = 2; tau < halfSize; tau++) {
      if (yinBuf[tau] < threshold) {
        while (tau + 1 < halfSize && yinBuf[tau + 1] < yinBuf[tau]) tau++;
        break;
      }
    }
    if (tau === halfSize) return -1;

    let betterTau;
    const x0 = tau < 1 ? tau : tau - 1;
    const x2 = tau + 1 < halfSize ? tau + 1 : tau;
    if (x0 === tau) {
      betterTau = yinBuf[tau] <= yinBuf[x2] ? tau : x2;
    } else if (x2 === tau) {
      betterTau = yinBuf[tau] <= yinBuf[x0] ? tau : x0;
    } else {
      const s0 = yinBuf[x0], s1 = yinBuf[tau], s2 = yinBuf[x2];
      betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    return sampleRate / betterTau;
  }

  // ==========================================================
  // 8. AUDIO RECORDING & PITCH SAMPLING
  // ==========================================================

  let audioCtx = null;
  let analyserNode = null;
  let micStream = null;
  let stereoRecordStream = null;
  let pitchSamples = [];
  let recordingStartTime = 0;
  let samplingRAF = null;
  let isRecording = false;

  async function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      }
    });
    const source = audioCtx.createMediaStreamSource(micStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 4096;
    source.connect(analyserNode);

    const stereoDest = audioCtx.createMediaStreamDestination();
    stereoDest.channelCount = 2;
    const merger = audioCtx.createChannelMerger(2);
    source.connect(merger, 0, 0);
    source.connect(merger, 0, 1);
    merger.connect(stereoDest);
    stereoRecordStream = stereoDest.stream;
  }

  function startPitchSampling() {
    pitchSamples = [];
    recordingStartTime = performance.now();
    isRecording = true;
    samplePitch();
  }

  function samplePitch() {
    if (!isRecording) return;

    const buffer = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(buffer);

    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);

    const time = (performance.now() - recordingStartTime) / 1000;
    const hz = detectPitchYIN(buffer, audioCtx.sampleRate);

    if (hz > 0 && rms > 0.008) {
      const midi = hzToMidi(hz);
      if (midi >= 40 && midi <= 96) {
        pitchSamples.push({ time, hz, midi, rms });
      }
    } else {
      pitchSamples.push({ time, hz: 0, midi: 0, rms });
    }

    samplingRAF = requestAnimationFrame(samplePitch);
  }

  function stopPitchSampling() {
    isRecording = false;
    if (samplingRAF) cancelAnimationFrame(samplingRAF);
  }

  // ==========================================================
  // 9. METRONOME (6/8 — click on compound beats)
  // ==========================================================

  function playClick(audioCtx, time, isAccent, dest) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(dest || audioCtx.destination);
    osc.frequency.value = isAccent ? 1000 : 800;
    gain.gain.setValueAtTime(isAccent ? 0.3 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function scheduleMetronome(audioCtx, bpm, meter, numMeasures, countInBars, dest) {
    const secPerQuarterBeat = 40 / bpm;
    const secPerEighth = secPerQuarterBeat / 2;
    const eighthsPerMeasure = 6;
    const totalBars = countInBars + numMeasures;
    const totalEighths = totalBars * eighthsPerMeasure;
    const startTime = audioCtx.currentTime + 0.1;
    const countInDuration = countInBars * eighthsPerMeasure * secPerEighth;

    for (let e = 0; e < totalEighths; e++) {
      const time = startTime + e * secPerEighth;
      const posInMeasure = e % eighthsPerMeasure;
      const isAccent = posInMeasure === 0 || posInMeasure === 3;
      playClick(audioCtx, time, isAccent, dest);
    }

    return {
      countInEndTime: startTime + countInDuration,
      recordingEndTime: startTime + totalEighths * secPerEighth,
      startTime,
    };
  }

  // ==========================================================
  // 10. NOTE SEGMENTATION
  // ==========================================================

  function segmentNotes(samples) {
    if (samples.length === 0) return [];

    const notes = [];
    let currentMidi = -1;
    let startTime = 0;
    let midiAccum = [];

    function flushNote() {
      if (midiAccum.length === 0) return;
      const avgMidi = midiAccum.reduce((a, b) => a + b, 0) / midiAccum.length;
      const roundedMidi = Math.round(avgMidi);
      notes.push({
        midi: roundedMidi,
        name: midiToNoteName(roundedMidi),
        startTime: startTime,
        endTime: midiAccum._endTime || startTime,
        samples: midiAccum.length,
      });
      midiAccum = [];
    }

    for (const sample of samples) {
      const roundedSample = Math.round(sample.midi);

      if (sample.midi === 0) {
        if (midiAccum.length >= 2) {
          midiAccum._endTime = sample.time;
          flushNote();
        } else {
          midiAccum = [];
        }
        currentMidi = -1;
        continue;
      }

      if (currentMidi === -1 || Math.abs(roundedSample - currentMidi) > 1) {
        if (midiAccum.length >= 2) {
          midiAccum._endTime = sample.time;
          flushNote();
        } else {
          midiAccum = [];
        }
        currentMidi = roundedSample;
        startTime = sample.time;
        midiAccum = [sample.midi];
        midiAccum._endTime = sample.time;
      } else {
        midiAccum.push(sample.midi);
        midiAccum._endTime = sample.time;
      }
    }

    if (midiAccum.length >= 2) {
      flushNote();
    }

    const merged = [];
    for (const note of notes) {
      const prev = merged[merged.length - 1];
      if (prev &&
          prev.midi % 12 === note.midi % 12 &&
          (note.startTime - prev.endTime) < 0.12) {
        prev.endTime = note.endTime;
        prev.samples += note.samples;
      } else {
        merged.push({ ...note });
      }
    }

    return merged;
  }

  // ==========================================================
  // 11. SCORING ENGINE (chord-tone aware)
  // ==========================================================

  function pcDiffToChord(detMidi, chordPCs) {
    if (!chordPCs || chordPCs.length === 0) return 6;
    const detPC = detMidi % 12;
    let minDiff = Infinity;
    for (const pc of chordPCs) {
      const diff = Math.min(
        Math.abs(detPC - pc),
        12 - Math.abs(detPC - pc)
      );
      if (diff < minDiff) minDiff = diff;
    }
    return minDiff;
  }

  function scoreMelody(expected, detected, recordingDuration) {
    const results = expected.map(function (e) {
      return {
        expected: e,
        matched: false,
        detectedNote: null,
        pitchCorrect: false,
        evaluated: false,
      };
    });

    const usedDetected = new Set();

    // Pass 1: match by chord-tone proximity + timing
    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];

      if (recordingDuration != null && exp.startTime >= recordingDuration) {
        continue;
      }

      if (exp.isRest) {
        const tolerance = 0.15;
        const restStart = exp.startTime + tolerance;
        const restEnd = exp.startTime + exp.duration - tolerance;
        let soundDuringRest = false;

        for (const det of detected) {
          if (det.startTime >= restStart && det.startTime < restEnd) {
            soundDuringRest = true;
            results[i].detectedNote = det;
            break;
          }
        }

        results[i].matched = true;
        results[i].pitchCorrect = !soundDuringRest;
        results[i].evaluated = true;
        continue;
      }

      const secPerBeat = exp.duration / (exp.quarterBeats || 1);
      const timeTolerance = Math.max(exp.duration * 0.75, secPerBeat * 0.75, 0.75);
      let bestMatch = null;
      let bestScore = Infinity;

      for (let d = 0; d < detected.length; d++) {
        if (usedDetected.has(d)) continue;
        const det = detected[d];

        if (det.startTime < exp.startTime - timeTolerance) continue;
        if (det.startTime > exp.startTime + timeTolerance) break;

        const timeDist = Math.abs(det.startTime - exp.startTime);
        const chordDiff = pcDiffToChord(det.midi, exp.chordPCs);
        const score = chordDiff * 3 + timeDist;
        if (score < bestScore) {
          bestScore = score;
          bestMatch = { detIdx: d, det, chordDiff };
        }
      }

      if (bestMatch) {
        usedDetected.add(bestMatch.detIdx);
        results[i].matched = true;
        results[i].detectedNote = bestMatch.det;
        results[i].pitchCorrect = bestMatch.chordDiff === 0;
      }
      results[i].evaluated = true;
    }

    // Pass 2: retry unmatched
    for (let i = 0; i < results.length; i++) {
      if (results[i].matched || !results[i].evaluated) continue;
      const exp = results[i].expected;
      if (exp.isRest) continue;

      const secPerBeat = exp.duration / (exp.quarterBeats || 1);
      const timeTolerance = Math.max(secPerBeat * 0.5, 0.5);
      let bestMatch = null;
      let bestScore = Infinity;

      for (let d = 0; d < detected.length; d++) {
        if (usedDetected.has(d)) continue;
        const det = detected[d];
        if (det.startTime < exp.startTime - timeTolerance) continue;
        if (det.startTime > exp.startTime + timeTolerance) break;

        const timeDist = Math.abs(det.startTime - exp.startTime);
        const chordDiff = pcDiffToChord(det.midi, exp.chordPCs);
        const score = chordDiff * 3 + timeDist;
        if (score < bestScore) {
          bestScore = score;
          bestMatch = { detIdx: d, det, chordDiff };
        }
      }

      if (bestMatch) {
        usedDetected.add(bestMatch.detIdx);
        results[i].matched = true;
        results[i].detectedNote = bestMatch.det;
        results[i].pitchCorrect = bestMatch.chordDiff === 0;
      }
    }

    const totalNotes = results.filter(function (r) { return r.evaluated; }).length || expected.length;
    const correctNotes = results.filter(function (r) { return r.pitchCorrect; }).length;
    const matchedNotes = results.filter(function (r) { return r.matched; }).length;

    return {
      results: results,
      totalNotes: totalNotes,
      correctNotes: correctNotes,
      matchedNotes: matchedNotes,
      score: totalNotes > 0 ? Math.round((correctNotes / totalNotes) * 100) : 0,
    };
  }

  // ==========================================================
  // 12. VISUAL FEEDBACK — COLOR NOTES ON STAFF
  // ==========================================================

  function colorNoteElements(scoreResults) {
    const svgContainer = document.getElementById("notation");
    if (!svgContainer) return;

    svgContainer.querySelectorAll(".pitch-arrow").forEach(function (a) { a.remove(); });

    const allEls = svgContainer.querySelectorAll(".abcjs-note, .abcjs-rest");
    let idx = 0;

    for (const el of allEls) {
      if (idx >= scoreResults.results.length) break;
      const result = scoreResults.results[idx];

      var color;
      if (result.expected.isRest) {
        color = result.pitchCorrect ? "#2eaa2e" : "#d43232";
      } else if (result.pitchCorrect) {
        color = "#2eaa2e";
      } else if (result.matched) {
        color = "#e8a317";
      } else {
        color = "#d43232";
      }

      const paths = el.querySelectorAll("path");
      for (const path of paths) {
        path.setAttribute("fill", color);
        path.setAttribute("stroke", color);
      }
      const lines = el.querySelectorAll("line");
      for (const line of lines) {
        line.setAttribute("stroke", color);
      }

      idx++;
    }
  }

  // ==========================================================
  // 13. SCORE DISPLAY
  // ==========================================================

  function showScore(scoreResult) {
    const el = document.getElementById("scoreDisplay");
    const pct = scoreResult.score;
    var grade, gradeClass;

    if (scoreResult.stoppedEarly) { grade = "Didn't Finish"; gradeClass = "grade-dnf"; }
    else if (pct === 100) { grade = "Perfect!"; gradeClass = "grade-s"; }
    else if (pct >= 90) { grade = "Excellent!"; gradeClass = "grade-a"; }
    else if (pct >= 75) { grade = "Good"; gradeClass = "grade-b"; }
    else if (pct >= 60) { grade = "Fair"; gradeClass = "grade-c"; }
    else { grade = "Keep Practicing"; gradeClass = "grade-d"; }

    el.innerHTML =
      '<div class="score-card ' + gradeClass + '">' +
        '<div class="score-pct">' + pct + '%</div>' +
        '<div class="score-grade">' + grade + '</div>' +
        '<div class="score-detail">' +
          scoreResult.correctNotes + ' of ' + scoreResult.totalNotes + ' notes correct' +
        '</div>' +
      '</div>';
    el.style.display = "block";
  }

  function hideScore() {
    const el = document.getElementById("scoreDisplay");
    el.innerHTML = "";
    el.style.display = "none";
    document.getElementById("shareRecordingBtn").disabled = true;
  }

  // ==========================================================
  // 13b. SHARE — capture notation + score as image
  // ==========================================================

  async function captureResultImage() {
    const notationEl = document.getElementById("notation");
    const scoreEl = document.getElementById("scoreDisplay");
    const svgEl = notationEl.querySelector("svg");
    if (!svgEl) return null;

    const svgClone = svgEl.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const svgImg = await new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = svgUrl;
    });

    const padding = 30;
    const scale = 2;
    const svgW = svgImg.naturalWidth || svgEl.clientWidth;
    const svgH = svgImg.naturalHeight || svgEl.clientHeight;
    const scoreCardH = 100;
    const attempt = attempts[activeAttemptIdx];
    const isDaily = attempt && attempt.settings && attempt.settings.isDaily;
    const dailyDate = isDaily ? attempt.settings.dailyDate : "";
    const headerH = isDaily ? 80 : 50;
    const canvasW = Math.max(svgW, 500);
    const canvasH = headerH + svgH + scoreCardH + padding * 3;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    var keyLabel, meter, bpm, diff;
    if (activeAttemptIdx >= 0 && attempts[activeAttemptIdx] && attempts[activeAttemptIdx].settings) {
      const s = attempts[activeAttemptIdx].settings;
      keyLabel = s.keyLabel;
      meter = s.meter;
      bpm = s.bpm;
      diff = s.difficulty;
    } else {
      keyLabel = document.getElementById("keySelect").selectedOptions[0].text;
      meter = document.getElementById("meterSelect").value;
      bpm = document.getElementById("bpmSelect").value;
      diff = document.getElementById("difficultySelect").value;
    }
    const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
    const headerText = keyLabel + "  |  " + meter + "  |  " + bpm + " BPM  |  " + diffLabel;

    ctx.fillStyle = "#333";
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(headerText, canvasW / 2, padding + 16);

    if (isDaily) {
      const badgeText = "\u{1F31F} Daily Challenge — " + dailyDate;
      ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
      const textW = ctx.measureText(badgeText).width;
      const badgePadX = 14;
      const badgeW = textW + badgePadX * 2;
      const badgeH = 22;
      const badgeX = (canvasW - badgeW) / 2;
      const badgeY = padding + 28;
      ctx.fillStyle = "#8e44ad";
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 11);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, canvasW / 2, badgeY + badgeH - 6);
    }

    ctx.drawImage(svgImg, (canvasW - svgW) / 2, headerH + padding, svgW, svgH);
    URL.revokeObjectURL(svgUrl);

    const scoreCard = scoreEl.querySelector(".score-card");
    if (scoreCard) {
      const pctText = scoreCard.querySelector(".score-pct");
      const gradeText = scoreCard.querySelector(".score-grade");
      const detailText = scoreCard.querySelector(".score-detail");

      const scoreY = headerH + svgH + padding * 2;

      const pillW = 280;
      const pillH = 60;
      const pillX = (canvasW - pillW) / 2;
      const bgColor = scoreCard.classList.contains("grade-dnf") ? "#777"
                    : scoreCard.classList.contains("grade-s") ? "#FFD000"
                    : scoreCard.classList.contains("grade-a") ? "#27ae60"
                    : scoreCard.classList.contains("grade-b") ? "#2980b9"
                    : scoreCard.classList.contains("grade-c") ? "#e8a317"
                    : "#c0392b";
      const textColor = (scoreCard.classList.contains("grade-s") || scoreCard.classList.contains("grade-dnf")) ? "#333" : "#fff";

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(pillX, scoreY, pillW, pillH, 10);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = "bold 26px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        (pctText ? pctText.textContent : "") + "  " + (gradeText ? gradeText.textContent : ""),
        canvasW / 2, scoreY + 30
      );
      ctx.font = "14px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(
        detailText ? detailText.textContent : "",
        canvasW / 2, scoreY + 50
      );
    }

    return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
  }

  // ==========================================================
  // 13c. SHARE RECORDING
  // ==========================================================

  async function shareRecording() {
    const attempt = attempts[activeAttemptIdx];
    if (!attempt || !attempt.settings.audioBlob) {
      setStatus("No recording available.");
      return;
    }

    const audioBlob = attempt.settings.audioBlob;
    const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    const mimeType = audioBlob.type || "audio/webm";

    setStatus("Preparing recording...");
    const imgBlob = await captureResultImage();

    const audioFile = new File([audioBlob], "sightreading-recording." + ext, { type: mimeType });
    const files = [audioFile];
    if (imgBlob) {
      files.push(new File([imgBlob], "sightreading-score.png", { type: "image/png" }));
    }

    var keyLabel = "";
    var meter = "";
    if (attempt.settings) {
      keyLabel = attempt.settings.keyLabel;
      meter = attempt.settings.meter;
    }
    const shareTitle = "Sight Reading Recording — " + keyLabel + " " + meter;

    if (navigator.canShare && navigator.canShare({ files: files })) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, files: files });
        setStatus("");
      } catch (err) {
        if (err.name !== "AbortError") {
          fallbackDownload(audioBlob, "sightreading-recording." + ext);
          if (imgBlob) fallbackDownload(imgBlob, "sightreading-score.png");
        }
        setStatus("");
      }
    } else {
      fallbackDownload(audioBlob, "sightreading-recording." + ext);
      if (imgBlob) fallbackDownload(imgBlob, "sightreading-score.png");
      setStatus("");
    }
  }

  function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================================
  // 14. STATUS / COUNTDOWN DISPLAY
  // ==========================================================

  function setStatus(msg) {
    document.getElementById("statusDisplay").textContent = msg;
  }

  function clearStatus() {
    document.getElementById("statusDisplay").textContent = "";
  }

  // ==========================================================
  // 15. MAIN CONTROLLER
  // ==========================================================

  let currentMeasures = null;
  let currentExpectedNotes = null;
  let currentStyleDef = null;
  let currentMeter = null;
  let currentBpm = 60;
  let currentNumMeasures = 16;
  let currentMode = null;
  let currentIsDaily = false;
  let currentDailyDate = "";

  const MAX_ATTEMPTS = 4;
  let attempts = [];
  let activeAttemptIdx = -1;

  function generate() {
    const seedStr = String(Math.random()).slice(2);
    seedPRNG(seedStr);
    lastUsedSeed = seedStr;

    const styleName  = document.getElementById("keySelect").value;
    currentMeter     = document.getElementById("meterSelect").value;
    const difficulty = document.getElementById("difficultySelect").value;
    currentNumMeasures = parseInt(document.getElementById("measuresSelect").value, 10);
    currentBpm       = parseInt(document.getElementById("bpmSelect").value, 10);
    currentStyleDef  = STYLE_DEFS[styleName];

    currentMeasures = generateMelody(styleName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);
    currentStrumDirs = buildStrumDirList(currentMeasures);

    const abc = melodyToAbc(currentMeasures, currentStyleDef, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();
    currentIsDaily = false;
    currentDailyDate = "";
    document.getElementById("dailyBanner").style.display = "none";

    document.getElementById("playBtn").disabled = false;
  }

  function onBpmChange() {
    currentBpm = parseInt(document.getElementById("bpmSelect").value, 10);
    if (currentMeasures) {
      currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);
    }
    stopPlayback();
    clearAttempts();
  }

  let recordingTimeouts = [];
  let recordingInterval = null;
  let recordingActive = false;
  let recordMetronomeGain = null;
  let mediaRecorder = null;
  let audioChunks = [];

  async function startRecording() {
    if (recordingActive) {
      finishRecording(true);
      return;
    }

    try {
      await initAudio();
    } catch (e) {
      setStatus("Microphone access denied. Please allow microphone access and try again.");
      return;
    }

    if (audioCtx.state === "suspended") await audioCtx.resume();

    recordingActive = true;
    const generateBtn = document.getElementById("generateBtn");
    const playBtn = document.getElementById("playBtn");
    stopPlayback();
    hideScore();
    generateBtn.disabled = true;
    playBtn.textContent = "■ Stop";
    playBtn.classList.add("playing");

    const abc = melodyToAbc(currentMeasures, currentStyleDef, currentMeter);
    render(abc);

    const countInBars = 1;
    recordMetronomeGain = audioCtx.createGain();
    recordMetronomeGain.connect(audioCtx.destination);
    scheduleMetronome(audioCtx, currentBpm, currentMeter, currentNumMeasures, countInBars, recordMetronomeGain);

    const secPerQuarterBeat = 40 / currentBpm;
    const secPerEighth = secPerQuarterBeat / 2;
    const eighthsPerMeasure = 6;
    const countInEighths = countInBars * eighthsPerMeasure;

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);

    recordingInterval = setInterval(function () {
      countUpBeat++;
      if (countUpBeat <= countInEighths) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("🎵 Recording...");
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
    }, secPerEighth * 1000);

    const countInMs = countInEighths * secPerEighth * 1000;
    recordingTimeouts.push(setTimeout(function () {
      startPitchSampling();
      audioChunks = [];
      try {
        mediaRecorder = new MediaRecorder(stereoRecordStream);
        mediaRecorder.ondataavailable = function (e) {
          if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.start();
      } catch (e) {
        mediaRecorder = null;
      }

      const allEls = getAllNoteRestEls();
      for (let i = 0; i < currentExpectedNotes.length; i++) {
        const note = currentExpectedNotes[i];
        if (i < allEls.length) {
          (function (idx) {
            var tid = setTimeout(function () {
              if (!recordingActive) return;
              highlightElement(allEls[idx]);
            }, note.startTime * 1000);
            recordingTimeouts.push(tid);
          })(i);
        }
      }
    }, countInMs));

    const melodyDurationMs = currentNumMeasures * eighthsPerMeasure * secPerEighth * 1000;
    const totalWaitMs = countInMs + melodyDurationMs + 500;

    recordingTimeouts.push(setTimeout(function () {
      finishRecording(false);
    }, totalWaitMs));
  }

  function finishRecording(stoppedEarly) {
    if (!recordingActive) return;
    recordingActive = false;

    clearHighlight();

    for (const tid of recordingTimeouts) clearTimeout(tid);
    recordingTimeouts = [];
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }

    stopPitchSampling();

    let audioBlob = null;
    const audioReady = new Promise(function (resolve) {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.onstop = function () {
          const mimeType = mediaRecorder.mimeType || "audio/webm";
          audioBlob = new Blob(audioChunks, { type: mimeType });
          resolve();
        };
        mediaRecorder.stop();
      } else {
        resolve();
      }
    });

    if (recordMetronomeGain) {
      recordMetronomeGain.gain.cancelScheduledValues(0);
      recordMetronomeGain.gain.setValueAtTime(0, 0);
      recordMetronomeGain.disconnect();
      recordMetronomeGain = null;
    }

    setStatus("Analyzing...");

    const generateBtn = document.getElementById("generateBtn");
    const playBtn = document.getElementById("playBtn");

    const detected = segmentNotes(pitchSamples);
    const recordingDuration = pitchSamples.length > 0
      ? pitchSamples[pitchSamples.length - 1].time
      : 0;
    const scoreResult = scoreMelody(currentExpectedNotes, detected, recordingDuration);
    scoreResult.stoppedEarly = !!stoppedEarly;

    const attemptSettings = {
      keyLabel: document.getElementById("keySelect").selectedOptions[0].text,
      meter: currentMeter,
      bpm: currentBpm,
      difficulty: document.getElementById("difficultySelect").value,
      seed: lastUsedSeed,
      isDaily: currentIsDaily,
      dailyDate: currentDailyDate,
    };
    audioReady.then(function () {
      attemptSettings.audioBlob = audioBlob;
      document.getElementById("shareRecordingBtn").disabled = false;
    });
    attempts.push({ scoreResult: scoreResult, settings: attemptSettings });
    activeAttemptIdx = attempts.length - 1;

    saveScoreToHistory({
      score: scoreResult.score,
      key: attemptSettings.keyLabel,
      meter: currentMeter,
      bpm: currentBpm,
      difficulty: attemptSettings.difficulty,
      measures: currentNumMeasures,
      seed: lastUsedSeed,
      date: new Date().toISOString(),
      stoppedEarly: !!stoppedEarly,
    });

    colorNoteElements(scoreResult);
    showScore(scoreResult);
    renderAttemptButtons();
    setStatus("");

    playBtn.textContent = "▶ Begin";
    playBtn.classList.remove("playing");
    generateBtn.disabled = false;

    if (attempts.length >= MAX_ATTEMPTS) {
      playBtn.disabled = true;
      setStatus("Max attempts reached. Generate a new melody to continue.");
    } else {
      playBtn.disabled = false;
    }
  }

  // ==========================================================
  // 16. ATTEMPT MANAGEMENT
  // ==========================================================

  // ==========================================================
  // 16b. CHORD STRUM PLAYBACK (sample-based)
  // ==========================================================

  let playbackCtx = null;
  let playbackTimeouts = [];
  let isPlaying = false;
  let highlightedEl = null;
  let playbackMasterGain = null;
  let activeSources = [];
  const HIGHLIGHT_COLOR = "#00aaff";

  const ALL_CHORDS = ["Em", "Cmaj7", "A9", "D", "E7", "A7", "B7", "E13"];
  const DUR_CODES = ["8D", "8U", "4D", "4U", "dqD", "dhD"];

  const sampleBuffers = {};
  let samplesLoaded = false;

  async function loadStrumSamples(ctx) {
    if (samplesLoaded) return;
    const promises = [];
    for (const chord of ALL_CHORDS) {
      for (const code of DUR_CODES) {
        const key = chord + "-" + code;
        const url = "audio/" + key + ".wav";
        promises.push(
          fetch(url).then(function (resp) {
            if (!resp.ok) return;
            return resp.arrayBuffer().then(function (buf) {
              return ctx.decodeAudioData(buf).then(function (decoded) {
                sampleBuffers[key] = decoded;
              });
            });
          }).catch(function (e) {
            console.warn("Sample load skipped: " + url, e);
          })
        );
      }
    }
    await Promise.all(promises);
    samplesLoaded = true;
  }

  function durToSampleCode(quarterBeats, dir) {
    if (quarterBeats <= 1.0) return "4" + dir;
    if (quarterBeats <= 1.5) return "dqD";
    return "dhD";
  }

  function scheduleStrumSample(chordName, durCode, audioTime, durationSec, ctx, dest) {
    const key = chordName + "-" + durCode;
    const buf = sampleBuffers[key];
    if (!buf) return;

    const source = ctx.createBufferSource();
    source.buffer = buf;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(1.0, audioTime);
    const fadeStart = audioTime + durationSec - 0.05;
    noteGain.gain.setValueAtTime(1.0, Math.max(audioTime, fadeStart));
    noteGain.gain.linearRampToValueAtTime(0, audioTime + durationSec);

    source.connect(noteGain);
    noteGain.connect(dest);
    source.start(audioTime);
    source.stop(audioTime + durationSec + 0.01);
    activeSources.push({ source: source, gain: noteGain });
  }

  function getAllNoteRestEls() {
    const svgContainer = document.getElementById("notation");
    return svgContainer ? svgContainer.querySelectorAll(".abcjs-note, .abcjs-rest") : [];
  }

  function highlightElement(el) {
    clearHighlight();
    if (!el) return;
    highlightedEl = el;
    const paths = el.querySelectorAll("path");
    for (const p of paths) {
      p.dataset.origFill = p.getAttribute("fill") || "";
      p.dataset.origStroke = p.getAttribute("stroke") || "";
      p.setAttribute("fill", HIGHLIGHT_COLOR);
      p.setAttribute("stroke", HIGHLIGHT_COLOR);
    }
    const lines = el.querySelectorAll("line");
    for (const l of lines) {
      l.dataset.origStroke = l.getAttribute("stroke") || "";
      l.setAttribute("stroke", HIGHLIGHT_COLOR);
    }
  }

  function clearHighlight() {
    if (!highlightedEl) return;
    const paths = highlightedEl.querySelectorAll("path");
    for (const p of paths) {
      if (p.dataset.origFill !== undefined) p.setAttribute("fill", p.dataset.origFill);
      if (p.dataset.origStroke !== undefined) p.setAttribute("stroke", p.dataset.origStroke);
    }
    const lines = highlightedEl.querySelectorAll("line");
    for (const l of lines) {
      if (l.dataset.origStroke !== undefined) l.setAttribute("stroke", l.dataset.origStroke);
    }
    highlightedEl = null;
  }

  async function startPlayback() {
    if (!currentExpectedNotes || currentExpectedNotes.length === 0) return;

    if (!playbackCtx) {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtx.state === "suspended") await playbackCtx.resume();

    await loadStrumSamples(playbackCtx);

    playbackMasterGain = playbackCtx.createGain();
    playbackMasterGain.connect(playbackCtx.destination);
    activeSources = [];

    isPlaying = true;
    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "■ Stop";
    playBtn.classList.add("playing");

    document.getElementById("generateBtn").disabled = true;

    const secPerQuarterBeat = 40 / currentBpm;
    const secPerEighth = secPerQuarterBeat / 2;
    const eighthsPerMeasure = 6;

    // Count-in (1 bar of 6/8 = 6 eighth-note clicks)
    const countInBars = 1;
    const countInEighths = countInBars * eighthsPerMeasure;
    const countInDuration = countInEighths * secPerEighth;

    const baseTime = playbackCtx.currentTime + 0.1;

    for (let e = 0; e < countInEighths; e++) {
      const time = baseTime + e * secPerEighth;
      const isAccent = e === 0 || e === 3;
      playClick(playbackCtx, time, isAccent, playbackMasterGain);
    }

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);
    const countInInterval = setInterval(function () {
      countUpBeat++;
      if (countUpBeat <= countInEighths) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("");
        clearInterval(countInInterval);
      }
    }, secPerEighth * 1000);
    playbackTimeouts.push(countInInterval);

    const melodyBaseTime = baseTime + countInDuration;
    const countInMs = countInDuration * 1000;

    // Schedule melody metronome clicks
    const totalEighths = currentNumMeasures * eighthsPerMeasure;
    for (let e = 0; e < totalEighths; e++) {
      const time = melodyBaseTime + e * secPerEighth;
      const posInMeasure = e % eighthsPerMeasure;
      const isAccent = posInMeasure === 0 || posInMeasure === 3;
      playClick(playbackCtx, time, isAccent, playbackMasterGain);
    }

    const allEls = getAllNoteRestEls();

    const strumGain = playbackCtx.createGain();
    strumGain.gain.value = 1.0;
    strumGain.connect(playbackMasterGain);

    for (let i = 0; i < currentExpectedNotes.length; i++) {
      const note = currentExpectedNotes[i];
      const noteStart = melodyBaseTime + note.startTime;

      if (!note.isRest && note.chordName) {
        const durCode = durToSampleCode(note.quarterBeats, note.strumDir || "D");
        scheduleStrumSample(note.chordName, durCode, noteStart, note.duration * 0.9, playbackCtx, strumGain);
      }

      if (i < allEls.length) {
        (function (idx) {
          var highlightDelay = countInMs + note.startTime * 1000;
          var tid = setTimeout(function () {
            if (!isPlaying) return;
            highlightElement(allEls[idx]);
          }, highlightDelay + 100);
          playbackTimeouts.push(tid);
        })(i);
      }
    }

    const lastNote = currentExpectedNotes[currentExpectedNotes.length - 1];
    const totalDuration = countInMs + (lastNote.startTime + lastNote.duration) * 1000 + 200;
    const endTid = setTimeout(function () {
      stopPlayback();
    }, totalDuration);
    playbackTimeouts.push(endTid);
  }

  function stopPlayback() {
    isPlaying = false;
    for (const tid of playbackTimeouts) clearTimeout(tid);
    playbackTimeouts = [];
    clearHighlight();
    clearStatus();

    if (playbackMasterGain && playbackCtx) {
      const now = playbackCtx.currentTime;
      playbackMasterGain.gain.setValueAtTime(playbackMasterGain.gain.value, now);
      playbackMasterGain.gain.linearRampToValueAtTime(0, now + 0.05);
      const masterRef = playbackMasterGain;
      setTimeout(function () {
        try { masterRef.disconnect(); } catch (e) {}
      }, 80);
      playbackMasterGain = null;
    }

    const srcCopy = activeSources.slice();
    setTimeout(function () {
      for (const item of srcCopy) {
        try { item.source.stop(); } catch (e) {}
      }
    }, 80);
    activeSources = [];

    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "▶ Begin";
    playBtn.classList.remove("playing");

    if (currentMeasures) {
      document.getElementById("generateBtn").disabled = false;
      playBtn.disabled = (currentMode === "challenge" && attempts.length >= MAX_ATTEMPTS);
    }
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function clearAttempts() {
    attempts = [];
    activeAttemptIdx = -1;
    const bar = document.getElementById("attemptsBar");
    bar.style.display = "none";
    document.getElementById("attemptButtons").innerHTML = "";
  }

  function renderAttemptButtons() {
    const bar = document.getElementById("attemptsBar");
    const container = document.getElementById("attemptButtons");
    container.innerHTML = "";

    if (attempts.length <= 1) {
      bar.style.display = "none";
      return;
    }

    bar.style.display = "flex";

    for (let i = 0; i < attempts.length; i++) {
      const btn = document.createElement("button");
      btn.className = "attempt-btn" + (i === activeAttemptIdx ? " active" : "");
      btn.innerHTML = "#" + (i + 1) +
        '<span class="attempt-score">' + attempts[i].scoreResult.score + '%</span>';
      (function (idx) {
        btn.addEventListener("click", function () { switchAttempt(idx); });
      })(i);
      container.appendChild(btn);
    }
  }

  function switchAttempt(idx) {
    if (idx < 0 || idx >= attempts.length) return;
    activeAttemptIdx = idx;

    const abc = melodyToAbc(currentMeasures, currentStyleDef, currentMeter);
    render(abc);
    colorNoteElements(attempts[idx].scoreResult);
    showScore(attempts[idx].scoreResult);
    renderAttemptButtons();
    const hasAudio = attempts[idx] && attempts[idx].settings.audioBlob;
    document.getElementById("shareRecordingBtn").disabled = !hasAudio;
  }

  // ==========================================================
  // 17. SCORE HISTORY (localStorage)
  // ==========================================================

  const SCORE_HISTORY_KEY = "sightreading-score-history-year2-level4";

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function loadScoreHistory() {
    try {
      return JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY)) || [];
    } catch (e) { return []; }
  }

  function saveScoreToHistory(entry) {
    const history = loadScoreHistory();
    history.push(entry);
    try { localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history)); }
    catch (e) { /* storage full */ }
  }

  function showHistory() {
    const history = loadScoreHistory();
    const modal = document.getElementById("historyModal");
    const content = document.getElementById("historyContent");

    const ranges = [
      { label: "S (100%)", cls: "grade-s" },
      { label: "A (90–99%)", cls: "grade-a" },
      { label: "B (75–89%)", cls: "grade-b" },
      { label: "C (60–74%)", cls: "grade-c" },
      { label: "D (0–59%)", cls: "grade-d" },
      { label: "DNF", cls: "grade-dnf" },
    ];

    const counts = ranges.map(function () { return 0; });
    for (const e of history) {
      if (e.stoppedEarly) counts[5]++;
      else if (e.score === 100) counts[0]++;
      else if (e.score >= 90) counts[1]++;
      else if (e.score >= 75) counts[2]++;
      else if (e.score >= 60) counts[3]++;
      else counts[4]++;
    }

    const maxCount = Math.max.apply(null, counts.concat([1]));

    let html = '<h2 class="history-title">📊 Score History</h2>';
    html += '<div class="history-total">Total Exercises Completed: <strong>' + history.length + '</strong></div>';

    html += '<div class="history-chart">';
    for (let i = 0; i < ranges.length; i++) {
      const pct = Math.round((counts[i] / maxCount) * 100);
      html += '<div class="history-row">' +
        '<span class="history-label">' + ranges[i].label + '</span>' +
        '<div class="history-bar-bg">' +
          '<div class="history-bar ' + ranges[i].cls + '" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<span class="history-count">' + counts[i] + '</span>' +
      '</div>';
    }
    html += '</div>';

    if (history.length > 0) {
      html += '<h3 class="history-subtitle">Recent Scores</h3>';
      html += '<div class="history-recent">';
      const recent = history.slice(-10).reverse();
      for (const r of recent) {
        const d = new Date(r.date).toLocaleDateString();
        html += '<div class="history-entry">' +
          '<span class="history-entry-score">' + (r.stoppedEarly ? 'DNF' : r.score + '%') + '</span>' +
          '<span class="history-entry-detail">' + escHtml(r.key) + ' ' + escHtml(r.meter) + ' ' + escHtml(r.difficulty) + ' ' + r.bpm + 'bpm</span>' +
          '<span class="history-entry-seed">Seed: ' + escHtml(r.seed || '—') + '</span>' +
          '<span class="history-entry-date">' + d + '</span>' +
        '</div>';
      }
      html += '</div>';
    }

    content.innerHTML = html;
    modal.style.display = "flex";
  }

  function hideHistory() {
    document.getElementById("historyModal").style.display = "none";
  }

  function dailyChallenge() {
    const now = new Date();
    const dateStr = now.getUTCFullYear() + "-" +
      String(now.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(now.getUTCDate()).padStart(2, "0");
    seedPRNG(dateStr);
    lastUsedSeed = dateStr;

    const styles = Object.keys(STYLE_DEFS);
    const bpmOpts = [50, 60, 70, 80];

    const styleName = styles[Math.floor(seededRandom() * styles.length)];
    const bpm = bpmOpts[Math.floor(seededRandom() * bpmOpts.length)];
    const numMeasures = 16;

    document.getElementById("keySelect").value = styleName;
    document.getElementById("bpmSelect").value = String(bpm);

    currentMeter = "6/8";
    currentNumMeasures = numMeasures;
    currentBpm = bpm;
    currentStyleDef = STYLE_DEFS[styleName];

    seedPRNG(dateStr + "-melody");

    currentMeasures = generateMelody(styleName, currentMeter, "level", currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);
    currentStrumDirs = buildStrumDirList(currentMeasures);

    const abc = melodyToAbc(currentMeasures, currentStyleDef, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();

    currentIsDaily = true;
    currentDailyDate = dateStr;
    document.getElementById("playBtn").disabled = false;
    document.getElementById("dailyBanner").textContent = "🌟 Daily Challenge — " + dateStr;
    document.getElementById("dailyBanner").style.display = "block";
  }

  // ==========================================================
  // 18. MODE SELECTION
  // ==========================================================

  function selectMode(mode) {
    currentMode = mode;
    document.body.setAttribute("data-mode", mode);
    document.getElementById("modeOverlay").style.display = "none";
    document.getElementById("mainContainer").style.display = "";

    const label = mode === "practice" ? "Practice Mode" : "Challenge Mode";
    document.getElementById("modeLabel").textContent = label;

    updateModeSwitchButton();
    generate();
  }

  function switchMode() {
    const newMode = currentMode === "practice" ? "challenge" : "practice";
    currentMode = newMode;
    document.body.setAttribute("data-mode", newMode);

    const label = newMode === "practice" ? "Practice Mode" : "Challenge Mode";
    document.getElementById("modeLabel").textContent = label;

    updateModeSwitchButton();
    generate();
  }

  function updateModeSwitchButton() {
    const btn = document.getElementById("switchModeBtn");
    if (!btn) return;
    btn.textContent = currentMode === "practice" ? "Switch to Challenge" : "Switch to Practice";
    btn.classList.remove("active-practice", "active-challenge");
    btn.classList.add(currentMode === "practice" ? "active-challenge" : "active-practice");
  }

  // Wire up
  document.getElementById("generateBtn").addEventListener("click", generate);
  document.getElementById("keySelect").addEventListener("change", generate);
  document.getElementById("meterSelect").addEventListener("change", generate);
  document.getElementById("difficultySelect").addEventListener("change", generate);
  document.getElementById("measuresSelect").addEventListener("change", generate);
  document.getElementById("bpmSelect").addEventListener("change", onBpmChange);
  var _dailyBtn = document.getElementById("dailyChallengeBtn");
  if (_dailyBtn) _dailyBtn.addEventListener("click", dailyChallenge);
  document.getElementById("playBtn").addEventListener("click", function () {
    if (currentMode === "practice") {
      togglePlayback();
    } else {
      startRecording();
    }
  });
  document.getElementById("shareRecordingBtn").addEventListener("click", shareRecording);
  document.getElementById("historyBtn").addEventListener("click", showHistory);
  document.getElementById("historyCloseBtn").addEventListener("click", hideHistory);
  document.getElementById("historyModal").addEventListener("click", function (e) {
    if (e.target === this) hideHistory();
  });
  document.getElementById("selectPractice").addEventListener("click", function () { selectMode("practice"); });
  document.getElementById("selectChallenge").addEventListener("click", function () { selectMode("challenge"); });
  document.getElementById("switchModeBtn").addEventListener("click", switchMode);
})();
