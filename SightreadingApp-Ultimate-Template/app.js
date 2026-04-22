// ============================================================
// Sight Reading Generator for Classical Guitar — WITH RECORDING & SCORING
// Uses ABCjs for notation, Web Audio API for pitch detection (YIN)
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // 1. MUSIC THEORY DATA
  // ==========================================================

  const NOTE_NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
  const FLAT_NAMES = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];

  const KEY_DEFS = {
    "C":  { tonic: 60, mode: "major", abcKey: "C",  usesFlats: false },
    "G":  { tonic: 55, mode: "major", abcKey: "G",  usesFlats: false },
    "D":  { tonic: 62, mode: "major", abcKey: "D",  usesFlats: false },
    "A":  { tonic: 57, mode: "major", abcKey: "A",  usesFlats: false },
    "F":  { tonic: 53, mode: "major", abcKey: "F",  usesFlats: true  },
    "Bb": { tonic: 58, mode: "major", abcKey: "Bb", usesFlats: true  },
    "Am": { tonic: 57, mode: "minor", abcKey: "Am", usesFlats: false },
    "Em": { tonic: 52, mode: "minor", abcKey: "Em", usesFlats: false },
    "Dm": { tonic: 62, mode: "minor", abcKey: "Dm", usesFlats: true  },
  };

  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

  const RANGE_LOW  = 52;  // E3
  const RANGE_HIGH = 77;  // F5

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
  // 2. SCALE & PITCH UTILITIES
  // ==========================================================

  function getScalePitches(keyDef) {
    const pattern = keyDef.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
    const pitches = [];
    for (let oct = -2; oct <= 2; oct++) {
      for (const offset of pattern) {
        const p = keyDef.tonic + oct * 12 + offset;
        if (p >= RANGE_LOW && p <= RANGE_HIGH) pitches.push(p);
      }
    }
    if (keyDef.mode === "minor") {
      for (let oct = -2; oct <= 2; oct++) {
        const raised7 = keyDef.tonic + oct * 12 + 11;
        if (raised7 >= RANGE_LOW && raised7 <= RANGE_HIGH && !pitches.includes(raised7)) {
          pitches.push(raised7);
        }
      }
    }
    pitches.sort((a, b) => a - b);
    return [...new Set(pitches)];
  }

  function scaleDegree(midi, keyDef) {
    const pattern = keyDef.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
    const interval = ((midi - keyDef.tonic) % 12 + 12) % 12;
    return pattern.indexOf(interval);
  }

  function isRaised7th(midi, keyDef) {
    if (keyDef.mode !== "minor") return false;
    return ((midi - keyDef.tonic) % 12 + 12) % 12 === 11;
  }

  function hzToMidi(hz) {
    return 12 * Math.log2(hz / 440) + 69;
  }

  function midiToNoteName(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const note = names[Math.round(midi) % 12];
    const oct = Math.floor(Math.round(midi) / 12) - 1;
    return note + oct;
  }

  // ==========================================================
  // 3. VOICE LEADING ENGINE
  // ==========================================================

  const DIFFICULTY = {
    easy: {
      maxInterval: 4, stepBias: 0.75,
      rhythms34: ["2", "1", "1 1"],
      rhythms44: ["2", "1", "1 1", "1 1 1"],
      restChance: 0.05, allowSyncopation: false,
    },
    medium: {
      maxInterval: 5, stepBias: 0.55,
      rhythms34: ["2", "1", "1 1", "3", "1/2 1/2 1", "1 1/2 1/2"],
      rhythms44: ["2", "1", "1 1", "1 1 1", "4", "1/2 1/2 1 1", "2 1 1"],
      restChance: 0.08, allowSyncopation: false,
    },
    hard: {
      maxInterval: 7, stepBias: 0.40,
      rhythms34: ["2", "1", "1 1", "3", "1/2 1/2 1", "1 1/2 1/2", "1/2 1/2 1/2 1/2 1/2 1/2"],
      rhythms44: ["2", "1", "1 1", "1 1 1", "4", "1/2 1/2 1 1", "2 1 1", "1/2 1/2 1/2 1/2 1 1", "3 1"],
      restChance: 0.10, allowSyncopation: true,
    }
  };

  function pickNextPitch(prevPitch, prevInterval, scalePitches, keyDef, diff, beatStrength) {
    const profile = DIFFICULTY[diff];
    const idx = scalePitches.indexOf(prevPitch);
    if (idx === -1) {
      return scalePitches.reduce((a, b) =>
        Math.abs(b - prevPitch) < Math.abs(a - prevPitch) ? b : a
      );
    }

    const candidates = [];
    for (let i = 0; i < scalePitches.length; i++) {
      const pitch = scalePitches[i];
      const stepsAway = Math.abs(i - idx);
      const semitonesAway = Math.abs(pitch - prevPitch);
      if (stepsAway === 0 || stepsAway > profile.maxInterval) continue;

      let weight = 1.0;
      if (stepsAway <= 2) weight *= (profile.stepBias / 0.3);
      else weight *= ((1 - profile.stepBias) / 0.7);

      if (prevInterval !== 0) {
        const prevDir = prevInterval > 0 ? 1 : -1;
        const curDir = pitch > prevPitch ? 1 : -1;
        if (Math.abs(prevInterval) > 2 && curDir !== prevDir) weight *= 2.0;
        if (Math.abs(prevInterval) > 2 && curDir === prevDir && stepsAway > 2) weight *= 0.2;
      }

      if (semitonesAway === 6) weight *= 0.1;

      if (beatStrength === "strong") {
        const deg = scaleDegree(pitch, keyDef);
        if (deg === 0) weight *= 1.8;
        else if (deg === 4) weight *= 1.4;
        else if (deg === 2) weight *= 1.2;
      }

      const mid = (RANGE_LOW + RANGE_HIGH) / 2;
      weight *= Math.max(0.3, 1 - Math.abs(pitch - mid) / 20);

      if (isRaised7th(pitch, keyDef)) {
        weight *= (pitch < prevPitch) ? 0.05 : 1.5;
      }
      if (isRaised7th(prevPitch, keyDef)) {
        weight *= (pitch === prevPitch + 1) ? 5.0 : 0.1;
      }

      candidates.push({ pitch, weight });
    }

    if (candidates.length === 0) {
      return scalePitches[Math.floor(seededRandom() * scalePitches.length)];
    }
    return weightedPick(candidates);
  }

  function weightedPick(candidates) {
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = seededRandom() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.pitch;
    }
    return candidates[candidates.length - 1].pitch;
  }

  // ==========================================================
  // 4. RHYTHM GENERATION
  // ==========================================================

  function parseRhythm(pattern) {
    return pattern.split(" ").map(s => {
      if (s.includes("/")) { const [n, d] = s.split("/").map(Number); return n / d; }
      return Number(s);
    });
  }

  function generateMeasureRhythm(beatsPerMeasure, diff) {
    const profile = DIFFICULTY[diff];
    const rhythmPool = beatsPerMeasure === 3 ? profile.rhythms34 : profile.rhythms44;
    const target = beatsPerMeasure;
    let attempts = 0;
    while (attempts < 50) {
      const pattern = rhythmPool[Math.floor(seededRandom() * rhythmPool.length)];
      const durations = parseRhythm(pattern);
      const total = durations.reduce((a, b) => a + b, 0);
      if (total === target) return durations;
      if (total < target) {
        const fill = Array(Math.round(target - total)).fill(1);
        const result = [...durations, ...fill];
        if (Math.abs(result.reduce((a, b) => a + b, 0) - target) < 0.01) return result;
      }
      attempts++;
    }
    return Array(beatsPerMeasure).fill(1);
  }

  // ==========================================================
  // 5. MELODY GENERATION
  // ==========================================================

  function generateMelody(keyName, meter, difficulty, numMeasures) {
    const keyDef = KEY_DEFS[keyName];
    const scalePitches = getScalePitches(keyDef);
    const beatsPerMeasure = meter === "3/4" ? 3 : 4;
    const profile = DIFFICULTY[difficulty];

    const mid = (RANGE_LOW + RANGE_HIGH) / 2;
    const tonicPitches = scalePitches.filter(p => scaleDegree(p, keyDef) === 0);
    let currentPitch = tonicPitches.reduce((a, b) =>
      Math.abs(b - mid) < Math.abs(a - mid) ? b : a
    );

    let prevInterval = 0;
    const measures = [];

    for (let m = 0; m < numMeasures; m++) {
      const isLast = m === numMeasures - 1;
      const rhythm = isLast
        ? [beatsPerMeasure]
        : generateMeasureRhythm(beatsPerMeasure, difficulty);

      const notes = [];
      let beatPos = 0;

      for (let n = 0; n < rhythm.length; n++) {
        const dur = rhythm[n];
        const isStrongBeat = beatPos === 0 || (beatsPerMeasure === 4 && beatPos === 2);
        const beatStrength = isStrongBeat ? "strong" : "weak";

        if (isLast) {
          const tonicNear = tonicPitches.reduce((a, b) =>
            Math.abs(b - currentPitch) < Math.abs(a - currentPitch) ? b : a
          );
          notes.push({ pitch: tonicNear, duration: dur, isRest: false });
          currentPitch = tonicNear;
        } else {
          if (seededRandom() < profile.restChance && beatPos > 0) {
            notes.push({ pitch: null, duration: dur, isRest: true });
          } else {
            const nextPitch = pickNextPitch(currentPitch, prevInterval, scalePitches, keyDef, difficulty, beatStrength);
            prevInterval = scalePitches.indexOf(nextPitch) - scalePitches.indexOf(currentPitch);
            currentPitch = nextPitch;
            notes.push({ pitch: nextPitch, duration: dur, isRest: false });
          }
        }
        beatPos += dur;
      }
      measures.push(notes);
    }

    return measures;
  }

  // ==========================================================
  // 6. ABC CONVERSION & RENDERING
  // ==========================================================

  function midiToAbc(midi, keyDef) {
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const names = keyDef.usesFlats ? FLAT_NAMES : NOTE_NAMES;
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

  function melodyToAbc(measures, keyDef, meter) {
    let abc = "X:1\nM:" + meter + "\nL:1/8\n%%stretchlast true\nK:C\n";

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      const accState = {};
      let beatPos = 0;

      for (let j = 0; j < measure.length; j++) {
        const note = measure[j];
        if (note.isRest) {
          abc += "z" + durationToAbc(note.duration);
        } else {
          let noteAbc = midiToAbc(note.pitch, keyDef);
          let acc = "";
          let base = noteAbc;
          if (/^[\^_=]/.test(noteAbc)) { acc = noteAbc[0]; base = noteAbc.slice(1); }
          const cur = accState[base] || "";
          if (acc === cur) noteAbc = base;
          else if (acc === "" && cur !== "") { noteAbc = "=" + base; accState[base] = ""; }
          else accState[base] = acc;
          abc += noteAbc + durationToAbc(note.duration);
        }

        const nextNote = measure[j + 1];
        const isEighth = note.duration === 0.5;
        const nextIsEighth = nextNote && nextNote.duration === 0.5;
        const curBeat = Math.floor(beatPos);
        const nextBeatPos = beatPos + note.duration;
        const sameBeat = curBeat === Math.floor(nextBeatPos) || (nextBeatPos % 1 === 0 && false);
        if (!(isEighth && nextIsEighth && sameBeat)) abc += " ";
        beatPos = nextBeatPos;
      }

      abc += (i === measures.length - 1) ? "|]" : "| ";
    }
    return abc;
  }

  // Build a flat list of expected MIDI note numbers (skipping rests) with timing info
  function buildExpectedNotes(measures, bpm, meter) {
    const beatsPerMeasure = meter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / bpm;
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
            duration: note.duration * secPerBeat,
            quarterBeats: note.duration,
          });
        } else if (note.pitch != null) {
          notes.push({
            midi: note.pitch,
            name: midiToNoteName(note.pitch),
            startTime: time,
            duration: note.duration * secPerBeat,
            quarterBeats: note.duration,
          });
        }
        time += note.duration * secPerBeat;
      }
    }
    return notes;
  }

  // Global index counter so ABCjs note classes line up with our expectedNotes
  function buildNoteIndexMap(measures) {
    // Returns a flat array index for each non-rest note, and -1 for rests
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

  function render(abcString) {
    const el = document.getElementById("notation");
    el.innerHTML = "";
    const tuneArr = ABCJS.renderAbc(el, abcString, {
      responsive: "resize",
      staffwidth: 900,
      wrap: { minSpacing: 1.5, maxSpacing: 2.8, preferredMeasuresPerLine: 4 },
      paddingtop: 10, paddingbottom: 20, paddingleft: 20, paddingright: 20,
      scale: 1.3,
      add_classes: true,
    });
    lastRenderedTune = tuneArr && tuneArr[0];
  }

  // ==========================================================
  // 7. YIN PITCH DETECTION ALGORITHM
  // ==========================================================

  function detectPitchYIN(buffer, sampleRate) {
    const bufSize = buffer.length;
    const halfSize = Math.floor(bufSize / 2);
    const yinBuf = new Float32Array(halfSize);

    // Step 1: Difference function
    for (let tau = 0; tau < halfSize; tau++) {
      yinBuf[tau] = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuf[tau] += delta * delta;
      }
    }

    // Step 2: Cumulative mean normalized difference
    yinBuf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuf[tau];
      yinBuf[tau] *= tau / runningSum;
    }

    // Step 3: Absolute threshold
    const threshold = 0.15;
    let tau;
    for (tau = 2; tau < halfSize; tau++) {
      if (yinBuf[tau] < threshold) {
        while (tau + 1 < halfSize && yinBuf[tau + 1] < yinBuf[tau]) tau++;
        break;
      }
    }
    if (tau === halfSize) return -1;

    // Step 4: Parabolic interpolation
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
  let stereoRecordStream = null; // stereo stream for MediaRecorder
  let pitchSamples = [];    // { time, hz, midi, rms }
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

    // Create a stereo destination for recording (mono mic → both L+R)
    const stereoDest = audioCtx.createMediaStreamDestination();
    stereoDest.channelCount = 2;
    const merger = audioCtx.createChannelMerger(2);
    source.connect(merger, 0, 0); // mono → left
    source.connect(merger, 0, 1); // mono → right
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

    // RMS for silence detection
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);

    const time = (performance.now() - recordingStartTime) / 1000;
    const hz = detectPitchYIN(buffer, audioCtx.sampleRate);

    if (hz > 0 && rms > 0.008) {
      const midi = hzToMidi(hz);
      // Guitar range filter: ignore wild detections outside E2-C6
      if (midi >= 40 && midi <= 84) {
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
  // 9. METRONOME
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
    const secPerBeat = 60 / bpm;
    const beatsPerMeasure = meter === "3/4" ? 3 : 4;
    const totalBars = countInBars + numMeasures;
    const totalBeats = totalBars * beatsPerMeasure;
    const startTime = audioCtx.currentTime + 0.1;
    const countInDuration = countInBars * beatsPerMeasure * secPerBeat;

    for (let beat = 0; beat < totalBeats; beat++) {
      const time = startTime + beat * secPerBeat;
      const isAccent = (beat % beatsPerMeasure) === 0;
      playClick(audioCtx, time, isAccent, dest);
    }

    return {
      countInEndTime: startTime + countInDuration,
      recordingEndTime: startTime + totalBeats * secPerBeat,
      startTime,
    };
  }

  // ==========================================================
  // 10. NOTE SEGMENTATION
  // ==========================================================

  /**
   * Convert raw pitch samples into a sequence of discrete notes.
   * Groups consecutive samples with similar MIDI values, filters short noise.
   * Post-processes to merge same-pitch neighbors separated by brief gaps.
   */
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
        // Silence — flush current note
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
        // New note detected
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

    // Flush last note
    if (midiAccum.length >= 2) {
      flushNote();
    }

    // Post-process: merge consecutive notes with the same pitch class
    // separated by a brief gap (< 0.12s), which happens when detection
    // briefly drops out mid-note.
    const merged = [];
    for (const note of notes) {
      const prev = merged[merged.length - 1];
      if (prev &&
          prev.midi % 12 === note.midi % 12 &&
          (note.startTime - prev.endTime) < 0.12) {
        // Merge into previous: extend endTime, accumulate samples
        prev.endTime = note.endTime;
        prev.samples += note.samples;
      } else {
        merged.push({ ...note });
      }
    }

    return merged;
  }

  // ==========================================================
  // 11. SCORING ENGINE
  // ==========================================================

  /**
   * Compare detected notes against expected melody.
   * Uses time-window matching: for each expected note, find the best
   * detected note within a time window around the expected start time.
   * This is robust against detection splits and spurious notes.
   */
  function scoreMelody(expected, detected, recordingDuration) {
    const results = expected.map(e => ({
      expected: e,
      matched: false,
      detectedNote: null,
      pitchCorrect: false,
      evaluated: false,
    }));

    // Track which detected notes have been claimed to avoid double-counting
    const usedDetected = new Set();

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];

      // Skip notes/rests that start after the recording ended
      if (recordingDuration != null && exp.startTime >= recordingDuration) {
        continue;
      }

      // --- REST SCORING ---
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

      // --- PITCHED NOTE SCORING ---
      // Search ALL detected notes within ±timeTolerance of the expected start.
      // Prefer the closest pitch match, breaking ties by timing distance.
      const secPerBeat = exp.duration / (exp.quarterBeats || 1);
      const timeTolerance = Math.max(exp.duration * 0.75, secPerBeat * 0.75, 0.75);
      let bestMatch = null;
      let bestScore = Infinity;

      for (let d = 0; d < detected.length; d++) {
        if (usedDetected.has(d)) continue;
        const det = detected[d];

        // Skip notes too early
        if (det.startTime < exp.startTime - timeTolerance) continue;
        // Stop once past the window
        if (det.startTime > exp.startTime + timeTolerance) break;

        const timeDist = Math.abs(det.startTime - exp.startTime);

        // Score: heavily favour pitch-class matches, then timing
        const expPC = exp.midi % 12;
        const detPC = det.midi % 12;
        const pcDiff = Math.min(
          Math.abs(detPC - expPC),
          12 - Math.abs(detPC - expPC)
        );
        // Weight: pitch match is most important, then timing
        const score = pcDiff * 3 + timeDist;
        if (score < bestScore) {
          bestScore = score;
          bestMatch = { detIdx: d, det, pcDiff };
        }
      }

      if (bestMatch) {
        usedDetected.add(bestMatch.detIdx);
        results[i].matched = true;
        results[i].detectedNote = bestMatch.det;
        results[i].pitchCorrect = bestMatch.pcDiff === 0;
      }
      results[i].evaluated = true;
    }

    // --- SECOND PASS: retry unmatched notes against unclaimed detections ---
    // This recovers from "note stealing" where a detected note was claimed
    // by an adjacent expected note, leaving the real target unmatched.
    // Use a tighter window to avoid false positives.
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
        const expPC = exp.midi % 12;
        const detPC = det.midi % 12;
        const pcDiff = Math.min(
          Math.abs(detPC - expPC),
          12 - Math.abs(detPC - expPC)
        );
        const score = pcDiff * 3 + timeDist;
        if (score < bestScore) {
          bestScore = score;
          bestMatch = { detIdx: d, det, pcDiff };
        }
      }

      if (bestMatch) {
        usedDetected.add(bestMatch.detIdx);
        results[i].matched = true;
        results[i].detectedNote = bestMatch.det;
        results[i].pitchCorrect = bestMatch.pcDiff === 0;
      }
    }

    const totalNotes = results.filter(r => r.evaluated).length || expected.length;
    const correctNotes = results.filter(r => r.pitchCorrect).length;
    const matchedNotes = results.filter(r => r.matched).length;

    return {
      results,
      totalNotes,
      correctNotes,
      matchedNotes,
      score: totalNotes > 0 ? Math.round((correctNotes / totalNotes) * 100) : 0,
    };
  }

  // ==========================================================
  // 12. VISUAL FEEDBACK — COLOR NOTES ON STAFF
  // ==========================================================

  function colorNoteElements(scoreResults) {
    const svgContainer = document.getElementById("notation");
    if (!svgContainer) return;
    const svg = svgContainer.querySelector("svg");

    // Remove any previously added arrows
    svgContainer.querySelectorAll(".pitch-arrow").forEach(a => a.remove());

    // Select both pitched notes and rests in document order so indices
    // line up with the scoreResults array (which now includes rests).
    const allEls = svgContainer.querySelectorAll(".abcjs-note, .abcjs-rest");
    let idx = 0;

    for (const el of allEls) {
      if (idx >= scoreResults.results.length) break;
      const result = scoreResults.results[idx];

      let color;
      if (result.expected.isRest) {
        // Rest: green if player was silent, red if they played
        color = result.pitchCorrect ? "#2eaa2e" : "#d43232";
      } else if (result.pitchCorrect) {
        color = "#2eaa2e"; // green
      } else if (result.matched) {
        color = "#e8a317"; // orange — played but wrong pitch
      } else {
        color = "#d43232"; // red — missed entirely
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

      // Add sharp/flat arrow for wrong-pitch notes
      if (!result.expected.isRest && result.matched && !result.pitchCorrect && result.detectedNote && svg) {
        const direction = pitchDirection(result.expected.midi, result.detectedNote.midi);
        if (direction !== 0) {
          addPitchArrow(svg, el, color, direction);
        }
      }

      idx++;
    }
  }

  /** Return +1 if detected is sharp, -1 if flat, 0 if same pitch class */
  function pitchDirection(expectedMidi, detectedMidi) {
    const expPC = expectedMidi % 12;
    const detPC = detectedMidi % 12;
    // Signed pitch-class distance in range (-6, +6]
    let diff = detPC - expPC;
    if (diff > 6) diff -= 12;
    if (diff <= -6) diff += 12;
    if (Math.abs(diff) <= 0.5) return 0;
    return diff > 0 ? 1 : -1;
  }

  /** Append an SVG arrow (▲ or ▼) above or below a note element */
  function addPitchArrow(svg, noteEl, color, direction) {
    const bbox = noteEl.getBBox();
    const cx = bbox.x + bbox.width / 2;

    const arrowSize = 6;
    const gap = 4;

    let points;
    if (direction > 0) {
      // Sharp — upward arrow above the note
      const tipY = bbox.y - gap;
      points = (cx) + "," + (tipY) + " " +
               (cx - arrowSize) + "," + (tipY + arrowSize) + " " +
               (cx + arrowSize) + "," + (tipY + arrowSize);
    } else {
      // Flat — downward arrow below the note
      const tipY = bbox.y + bbox.height + gap;
      points = (cx) + "," + (tipY + arrowSize) + " " +
               (cx - arrowSize) + "," + (tipY) + " " +
               (cx + arrowSize) + "," + (tipY);
    }

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", points);
    polygon.setAttribute("fill", color);
    polygon.setAttribute("class", "pitch-arrow");
    svg.appendChild(polygon);
  }

  // ==========================================================
  // 13. SCORE DISPLAY
  // ==========================================================

  function showScore(scoreResult) {
    const el = document.getElementById("scoreDisplay");
    const pct = scoreResult.score;
    let grade, gradeClass;

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
  // 13b. SHARE — capture notation + score as image, use Web Share API
  // ==========================================================

  /**
   * Render the notation SVG and score card onto a canvas, return as a Blob (PNG).
   */
  async function captureResultImage() {
    const notationEl = document.getElementById("notation");
    const scoreEl = document.getElementById("scoreDisplay");
    const svgEl = notationEl.querySelector("svg");
    if (!svgEl) return null;

    // Serialize the SVG with inline styles
    const svgClone = svgEl.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Load SVG into an image
    const svgImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    // Dimensions
    const padding = 30;
    const scale = 2; // retina quality
    const svgW = svgImg.naturalWidth || svgEl.clientWidth;
    const svgH = svgImg.naturalHeight || svgEl.clientHeight;
    const scoreCardH = 100;
    const headerH = 50;
    const canvasW = Math.max(svgW, 500);
    const canvasH = headerH + svgH + scoreCardH + padding * 3;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Header text — use saved attempt settings if available
    let keyLabel, meter, bpm, diff;
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

    // Draw SVG notation
    ctx.drawImage(svgImg, (canvasW - svgW) / 2, headerH + padding, svgW, svgH);
    URL.revokeObjectURL(svgUrl);

    // Draw score summary
    const scoreCard = scoreEl.querySelector(".score-card");
    if (scoreCard) {
      const pctText = scoreCard.querySelector(".score-pct");
      const gradeText = scoreCard.querySelector(".score-grade");
      const detailText = scoreCard.querySelector(".score-detail");

      const scoreY = headerH + svgH + padding * 2;

      // Score background pill
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

    // Convert canvas to blob
    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  }

  // ==========================================================
  // 13c. SHARE RECORDING — download/share audio of performance
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

    // Also capture the score image to share both
    setStatus("Preparing recording...");
    const imgBlob = await captureResultImage();

    const audioFile = new File([audioBlob], "sightreading-recording." + ext, { type: mimeType });
    const files = [audioFile];
    if (imgBlob) {
      files.push(new File([imgBlob], "sightreading-score.png", { type: "image/png" }));
    }

    let keyLabel = "";
    let meter = "";
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
          fallbackDownloadAudio(audioBlob, ext);
        }
        setStatus("");
      }
    } else {
      fallbackDownloadAudio(audioBlob, ext);
      setStatus("");
    }
  }

  function fallbackDownloadAudio(blob, ext) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sightreading-recording." + ext;
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
  let currentKeyDef = null;
  let currentMeter = null;
  let currentBpm = 80;
  let currentNumMeasures = 8;
  let currentMode = null;

  const MAX_ATTEMPTS = 4;
  let attempts = [];        // Array of { scoreResult, index }
  let activeAttemptIdx = -1; // Which attempt is currently displayed

  function generate() {
    const seedStr = String(Math.random()).slice(2);
    seedPRNG(seedStr);
    lastUsedSeed = seedStr;

    const keyName    = document.getElementById("keySelect").value;
    currentMeter     = document.getElementById("meterSelect").value;
    const difficulty = document.getElementById("difficultySelect").value;
    currentNumMeasures = parseInt(document.getElementById("measuresSelect").value, 10);
    currentBpm       = parseInt(document.getElementById("bpmSelect").value, 10);
    currentKeyDef    = KEY_DEFS[keyName];

    currentMeasures = generateMelody(keyName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);

    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();
    document.getElementById("dailyBanner").style.display = "none";

    document.getElementById("playBtn").disabled = false;
  }

  let recordingTimeouts = [];   // setTimeout IDs for recording flow
  let recordingInterval = null;  // countdown interval
  let recordingActive = false;   // true from click to scoring complete
  let recordMetronomeGain = null; // gain node for recording metronome (to silence on early stop)
  let mediaRecorder = null;      // MediaRecorder for capturing audio
  let audioChunks = [];           // chunks from MediaRecorder

  async function startRecording() {
    // If already recording, stop early
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
    playBtn.textContent = "\u25A0 Stop";
    playBtn.classList.add("playing");

    // Re-render clean (remove any previous coloring)
    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
    render(abc);

    const countInBars = 1;
    recordMetronomeGain = audioCtx.createGain();
    recordMetronomeGain.connect(audioCtx.destination);
    scheduleMetronome(audioCtx, currentBpm, currentMeter, currentNumMeasures, countInBars, recordMetronomeGain);

    const beatsPerMeasure = currentMeter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / currentBpm;
    const countInBeats = countInBars * beatsPerMeasure;

    // Count-in display (counts up: 1, 2, 3, 4...)
    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);

    recordingInterval = setInterval(() => {
      countUpBeat++;
      if (countUpBeat <= countInBeats) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("🎵 Recording...");
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
    }, secPerBeat * 1000);

    // Start recording after count-in
    const countInMs = countInBars * beatsPerMeasure * secPerBeat * 1000;
    recordingTimeouts.push(setTimeout(() => {
      startPitchSampling();
      // Start MediaRecorder for audio capture
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

      // Schedule note highlighting during recording (like playback)
      const allEls = getAllNoteRestEls();
      for (let i = 0; i < currentExpectedNotes.length; i++) {
        const note = currentExpectedNotes[i];
        if (i < allEls.length) {
          const tid = setTimeout(() => {
            if (!recordingActive) return;
            highlightElement(allEls[i]);
          }, note.startTime * 1000);
          recordingTimeouts.push(tid);
        }
      }
    }, countInMs));

    // Stop recording after the melody duration
    const melodyDurationMs = currentNumMeasures * beatsPerMeasure * secPerBeat * 1000;
    const totalWaitMs = countInMs + melodyDurationMs + 500; // 500ms buffer

    recordingTimeouts.push(setTimeout(() => {
      finishRecording(false);
    }, totalWaitMs));
  }

  function finishRecording(stoppedEarly) {
    if (!recordingActive) return;
    recordingActive = false;

    // Clear note highlight from recording
    clearHighlight();

    // Cancel any pending timeouts/intervals
    for (const tid of recordingTimeouts) clearTimeout(tid);
    recordingTimeouts = [];
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }

    stopPitchSampling();

    // Stop MediaRecorder and build audio blob
    let audioBlob = null;
    const audioReady = new Promise(resolve => {
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
    // Compute actual recording duration from samples
    const recordingDuration = pitchSamples.length > 0
      ? pitchSamples[pitchSamples.length - 1].time
      : 0;
    const scoreResult = scoreMelody(currentExpectedNotes, detected, recordingDuration);
    scoreResult.stoppedEarly = !!stoppedEarly;

      // Store this attempt with its settings
      const attemptSettings = {
        keyLabel: document.getElementById("keySelect").selectedOptions[0].text,
        meter: currentMeter,
        bpm: currentBpm,
        difficulty: document.getElementById("difficultySelect").value,
        seed: lastUsedSeed,
      };
      // Wait for audio blob to be ready before storing attempt
      audioReady.then(function () {
        attemptSettings.audioBlob = audioBlob;
        document.getElementById("shareRecordingBtn").disabled = false;
      });
      attempts.push({ scoreResult, settings: attemptSettings });
      activeAttemptIdx = attempts.length - 1;

      // Save to persistent score history
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
  // 16b. MELODY PLAYBACK
  // ==========================================================

  let playbackCtx = null;
  let playbackTimeouts = [];
  let isPlaying = false;
  let highlightedEl = null;
  const HIGHLIGHT_COLOR = "#00aaff";

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /** Play a single note with a plucked-guitar-like envelope */
  function playNote(ctx, midi, startTime, duration) {
    const hz = midiToHz(midi);

    const noteEnd = startTime + duration * 0.95;

    // Fundamental
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;

    // Slight harmonic for body
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2;

    const gain = ctx.createGain();
    const gain2 = ctx.createGain();

    // Pluck envelope: quick attack, initial decay, sustain, then fade out
    const attackEnd = startTime + 0.008;
    const bodyEnd = startTime + Math.min(0.06, duration * 0.1);
    const fadeStart = noteEnd - Math.min(0.15, duration * 0.15);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.25, attackEnd);
    gain.gain.exponentialRampToValueAtTime(0.10, bodyEnd);
    // Hold sustain level until fade-out
    gain.gain.setValueAtTime(0.10, fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteEnd);

    gain2.gain.setValueAtTime(0.001, startTime);
    gain2.gain.linearRampToValueAtTime(0.06, startTime + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + Math.min(0.5, duration * 0.4));

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(ctx.destination);
    gain2.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(noteEnd + 0.05);
    osc2.start(startTime);
    osc2.stop(noteEnd + 0.05);
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

  function startPlayback() {
    if (!currentExpectedNotes || currentExpectedNotes.length === 0) return;

    if (!playbackCtx) {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtx.state === "suspended") playbackCtx.resume();

    isPlaying = true;
    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "\u25A0 Stop";
    playBtn.classList.add("playing");

    // Disable other buttons during playback
    document.getElementById("generateBtn").disabled = true;

    const beatsPerMeasure = currentMeter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / currentBpm;

    // --- Count-in (1 bar) ---
    const countInBars = 1;
    const countInBeats = countInBars * beatsPerMeasure;
    const countInDuration = countInBeats * secPerBeat;

    const baseTime = playbackCtx.currentTime + 0.1;

    // Schedule count-in clicks
    for (let beat = 0; beat < countInBeats; beat++) {
      const time = baseTime + beat * secPerBeat;
      playClick(playbackCtx, time, beat === 0, playbackCtx.destination);
    }

    // Count-in display (counts up: 1, 2, 3, 4...)
    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);
    const countInInterval = setInterval(() => {
      countUpBeat++;
      if (countUpBeat <= countInBeats) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("");
        clearInterval(countInInterval);
      }
    }, secPerBeat * 1000);
    playbackTimeouts.push(countInInterval); // so stopPlayback clears it

    // --- After count-in: schedule melody + metronome ---
    const melodyBaseTime = baseTime + countInDuration;
    const countInMs = countInDuration * 1000;

    // Schedule melody metronome clicks
    const totalBeats = currentNumMeasures * beatsPerMeasure;
    for (let beat = 0; beat < totalBeats; beat++) {
      const time = melodyBaseTime + beat * secPerBeat;
      playClick(playbackCtx, time, (beat % beatsPerMeasure) === 0, playbackCtx.destination);
    }

    const allEls = getAllNoteRestEls();

    for (let i = 0; i < currentExpectedNotes.length; i++) {
      const note = currentExpectedNotes[i];
      const noteStart = melodyBaseTime + note.startTime;

      // Schedule audio for pitched notes
      if (!note.isRest && note.midi != null) {
        playNote(playbackCtx, note.midi, noteStart, note.duration * 0.9);
      }

      // Schedule visual highlight
      if (i < allEls.length) {
        const highlightDelay = countInMs + note.startTime * 1000;
        const tid = setTimeout(() => {
          if (!isPlaying) return;
          highlightElement(allEls[i]);
        }, highlightDelay + 100); // +100ms to match audioCtx offset
        playbackTimeouts.push(tid);
      }
    }

    // Schedule end — clear highlight and restore button
    const lastNote = currentExpectedNotes[currentExpectedNotes.length - 1];
    const totalDuration = countInMs + (lastNote.startTime + lastNote.duration) * 1000 + 200;
    const endTid = setTimeout(() => {
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

    // Close the audio context to kill all scheduled oscillators
    if (playbackCtx) {
      playbackCtx.close().catch(() => {});
      playbackCtx = null;
    }

    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "\u25B6 Begin";
    playBtn.classList.remove("playing");

    // Re-enable buttons if we have a melody
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
      btn.addEventListener("click", () => switchAttempt(i));
      container.appendChild(btn);
    }
  }

  function switchAttempt(idx) {
    if (idx < 0 || idx >= attempts.length) return;
    activeAttemptIdx = idx;

    // Re-render clean notation then apply this attempt's coloring
    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
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

  const SCORE_HISTORY_KEY = "sightreading-score-history";

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
      { label: "S (95\u2013100%)", cls: "grade-s" },
      { label: "A (80\u201394%)", cls: "grade-a" },
      { label: "B (60\u201379%)", cls: "grade-b" },
      { label: "C (40\u201359%)", cls: "grade-c" },
      { label: "D (0\u201339%)", cls: "grade-d" },
      { label: "DNF", cls: "grade-dnf" },
    ];

    const counts = ranges.map(() => 0);
    for (const e of history) {
      if (e.stoppedEarly) counts[5]++;
      else if (e.score >= 95) counts[0]++;
      else if (e.score >= 80) counts[1]++;
      else if (e.score >= 60) counts[2]++;
      else if (e.score >= 40) counts[3]++;
      else counts[4]++;
    }

    const maxCount = Math.max(...counts, 1);

    let html = '<h2 class="history-title">\uD83D\uDCCA Score History</h2>';
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
          '<span class="history-entry-seed">Seed: ' + escHtml(r.seed || '\u2014') + '</span>' +
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

    // Pick settings deterministically from the seed
    const keys = Object.keys(KEY_DEFS);
    const diffs = ["easy", "medium", "hard"];
    const meters = ["4/4", "3/4"];
    const measureOpts = [4, 8];
    const bpmOpts = [50, 60, 70, 80];

    const keyName = keys[Math.floor(seededRandom() * keys.length)];
    const difficulty = diffs[Math.floor(seededRandom() * diffs.length)];
    const meter = meters[Math.floor(seededRandom() * meters.length)];
    const numMeasures = 4;
    const bpm = bpmOpts[Math.floor(seededRandom() * bpmOpts.length)];

    // Set the UI dropdowns to match
    document.getElementById("keySelect").value = keyName;
    document.getElementById("meterSelect").value = meter;
    document.getElementById("difficultySelect").value = difficulty;
    document.getElementById("measuresSelect").value = String(numMeasures);
    document.getElementById("bpmSelect").value = String(bpm);

    currentMeter = meter;
    currentNumMeasures = numMeasures;
    currentBpm = bpm;
    currentKeyDef = KEY_DEFS[keyName];

    // Re-seed for melody generation (so melody is also deterministic)
    seedPRNG(dateStr + "-melody");

    currentMeasures = generateMelody(keyName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);

    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();

    document.getElementById("playBtn").disabled = false;
    document.getElementById("dailyBanner").textContent = "\uD83C\uDF1F Daily Challenge — " + dateStr;
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
  document.getElementById("dailyChallengeBtn").addEventListener("click", dailyChallenge);
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
  document.getElementById("bpmSelect").addEventListener("change", function () {
    currentBpm = parseInt(this.value, 10);
    if (currentMeasures && currentMeter) {
      currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);
    }
  });
  document.getElementById("selectPractice").addEventListener("click", function () { selectMode("practice"); });
  document.getElementById("selectChallenge").addEventListener("click", function () { selectMode("challenge"); });
  document.getElementById("switchModeBtn").addEventListener("click", switchMode);
})();