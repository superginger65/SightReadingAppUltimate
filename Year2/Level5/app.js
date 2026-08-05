// ============================================================
// Sight Reading Generator for Classical Guitar — WITH RECORDING & SCORING
// Year 2 Level 5 — Chord Strumming in 2/4
// Uses ABCjs for notation, Web Audio API for pitch detection (YIN)
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // 1. MUSIC THEORY DATA — CHORDS, STRUM PATTERNS, FLOOR PLANS
  // ==========================================================

  const NOTE_NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
  const FLAT_NAMES = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];

  const CHORD_DEFS = {
    "G":  { display: "G",  tones: [43, 47, 50, 55, 59, 67], pcs: [7, 11, 2] },
    "D":  { display: "D",  tones: [50, 57, 62, 66],         pcs: [2, 6, 9] },
    "Em": { display: "Em", tones: [40, 47, 52, 55, 59, 64], pcs: [4, 7, 11] },
    "C":  { display: "C",  tones: [48, 52, 55, 60, 64],     pcs: [0, 4, 7] },
    "E":  { display: "E",  tones: [40, 47, 52, 56, 59, 64], pcs: [4, 8, 11] },
    "A":  { display: "A",  tones: [45, 52, 57, 61, 64],     pcs: [9, 1, 4] },
  };

  const STRUM_DISPLAY_PITCH = 71;

  // ----------------------------------------------------------
  // Strum rhythm patterns — durations in quarter-beat units
  // 2/4 measure = 2 quarter beats (4 eighths)
  // Negative values = rests of that absolute duration
  // sixteenth=0.25, eighth=0.5, dotted-eighth=0.75,
  // quarter=1.0, dotted-quarter=1.5, half=2.0
  // ----------------------------------------------------------

  const PATTERNS = {
    A: { durs: [1.0, 0.5, 0.5],                         dirs: ["d","d","d"] },
    B: { durs: [0.5, 0.5, 0.5, 0.5],                    dirs: ["d","d","d","d"] },
    C: { durs: [0.75, 0.25, 0.5, -0.5],                 dirs: ["d","u","d",null] },
    D: { durs: [1.5, 0.5],                               dirs: ["d","u"] },
    E: { durs: [0.5, 0.25, 0.25, 0.5, 0.25, 0.25],     dirs: ["d","d","u","d","d","u"] },
    F: { durs: [0.5, 0.25, 0.25, 0.5, 0.5],             dirs: ["d","u","d","u","d"] },
    G: { durs: [0.75, 0.25, 1.0],                        dirs: ["d","u","d"] },
    H: { durs: [0.75, 0.25, 0.5, 0.5],                  dirs: ["d","u","d","d"] },
    I: { durs: [1.0, 0.5, -0.5],                         dirs: ["d","u",null] },
    J: { durs: [0.5, 0.5, 1.0],                          dirs: ["d","u","u"] },
    K: { durs: [2.0],                                     dirs: ["d"] },
  };

  // ----------------------------------------------------------
  // Sample map — maps chord + duration/direction to WAV file
  // Available samples per chord: 4D, 8D, .8D, 16D, 16U, HD
  // ----------------------------------------------------------

  const SAMPLE_KEYS = ["4D", "8D", ".8D", "16D", "16U", "HD"];
  const CHORD_NAMES = ["G", "D", "Em", "C", "E", "A"];

  function getSampleKey(quarterBeats, dir) {
    if (quarterBeats >= 2.0) return "HD";
    if (quarterBeats >= 1.0) return "4D";
    if (quarterBeats >= 0.75) return ".8D";
    if (quarterBeats >= 0.5) return "8D";
    return dir === "u" ? "16U" : "16D";
  }

  const sampleBuffers = {};
  let samplesLoaded = false;

  async function loadSamples(ctx) {
    if (samplesLoaded) return;
    const promises = [];
    for (const chord of CHORD_NAMES) {
      sampleBuffers[chord] = {};
      for (const key of SAMPLE_KEYS) {
        const url = "audio/" + chord + "-" + key + ".wav";
        promises.push(
          fetch(url)
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { return ctx.decodeAudioData(buf); })
            .then(function (decoded) { sampleBuffers[chord][key] = decoded; })
            .catch(function () { /* sample missing — will fall back to synth */ })
        );
      }
    }
    await Promise.all(promises);
    samplesLoaded = true;
  }

  // ----------------------------------------------------------
  // Harmonic floor plan — 16 measures
  // Each entry: { chord: "name", patterns: ["A","B",...] }
  // ----------------------------------------------------------

  const FLOOR_PLAN = [
    { chord: "G",  patterns: ["A","B","C","D","J"] },
    { chord: "D",  patterns: ["E","F","G","H","I"] },
    { chord: "Em", patterns: ["A","B","E","F","G","J"] },
    { chord: "C",  patterns: ["A","C","D","G","J"] },
    { chord: "G",  patterns: ["A","B","C","D","J"] },
    { chord: "D",  patterns: ["E","F","G","H","I"] },
    { chord: "A",  patterns: ["B","E","F","H","I"] },
    { chord: "A",  patterns: ["B","E","F","H","I"] },
    { chord: "G",  patterns: ["A","B","C","D","J"] },
    { chord: "D",  patterns: ["E","F","G","H","I"] },
    { chord: "Em", patterns: ["A","B","E","F","G","J"] },
    { chord: "C",  patterns: ["A","C","D","G","J"] },
    { chord: "G",  patterns: ["A","B","C","D","J"] },
    { chord: "D",  patterns: ["E","F","G","H","I"] },
    { chord: "E",  patterns: ["B","E","F","H","I"] },
    { chord: "G",  patterns: ["K"] },
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

  let currentMeasureChords = [];

  function generateMelody(numMeasures) {
    const measures = [];
    currentMeasureChords = [];

    for (let m = 0; m < numMeasures; m++) {
      const slot = FLOOR_PLAN[m % FLOOR_PLAN.length];
      const chordName = slot.chord;
      const chordDef = CHORD_DEFS[chordName];
      const allowedPatterns = slot.patterns;

      const patKey = allowedPatterns[Math.floor(seededRandom() * allowedPatterns.length)];
      const pattern = PATTERNS[patKey];

      currentMeasureChords.push(chordName);

      const notes = [];
      for (let i = 0; i < pattern.durs.length; i++) {
        const dur = pattern.durs[i];
        const absDur = Math.abs(dur);
        const isRest = dur < 0;
        notes.push({
          pitch: isRest ? null : STRUM_DISPLAY_PITCH,
          duration: absDur,
          isRest: isRest,
          strumDir: isRest ? null : pattern.dirs[i],
          chordName: chordName,
          chordPCs: chordDef.pcs,
          showChord: i === 0,
        });
      }
      measures.push(notes);
    }

    return measures;
  }

  // ==========================================================
  // 4. ABC CONVERSION & RENDERING
  // ==========================================================

  function midiToAbc(midi) {
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const names = NOTE_NAMES;
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
    if (eighths === 1.5) return "3/2";
    if (eighths < 1) return "/" + Math.round(1 / eighths);
    return String(Math.round(eighths));
  }

  function melodyToAbc(measures) {
    let abc = "X:1\nM:2/4\nL:1/8\n%%stretchlast true\nK:G style=rhythm\n";

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      let beatPosEighths = 0;

      for (let j = 0; j < measure.length; j++) {
        const note = measure[j];
        const durEighths = note.duration * 2;

        if (note.showChord) {
          abc += '"' + note.chordName + '"';
        }

        if (note.isRest) {
          abc += "z" + durationToAbc(note.duration);
        } else {
          let noteAbc = midiToAbc(note.pitch);
          abc += noteAbc + durationToAbc(note.duration);
        }

        const nextNote = measure[j + 1];
        if (nextNote) {
          const nextBeatPosEighths = beatPosEighths + durEighths;
          const nextDurEighths = nextNote.duration * 2;
          const isSubBeat = durEighths < 2;
          const nextIsSubBeat = nextDurEighths < 2;

          let sameGroup = false;
          if (isSubBeat && nextIsSubBeat) {
            const curGroup = Math.floor(beatPosEighths / 2);
            const nextGroup = Math.floor(nextBeatPosEighths / 2);
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

  function buildExpectedNotes(measures, bpm) {
    const secPerQuarterBeat = 60 / bpm;
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
            strumDir: note.strumDir || "d",
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
  // 9. METRONOME (2/4 — click on quarter beats)
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

  function scheduleMetronome(audioCtx, bpm, numMeasures, countInBars, dest) {
    const secPerBeat = 60 / bpm;
    const beatsPerMeasure = 2;
    const totalBars = countInBars + numMeasures;
    const totalBeats = totalBars * beatsPerMeasure;
    const startTime = audioCtx.currentTime + 0.1;
    const countInDuration = countInBars * beatsPerMeasure * secPerBeat;

    for (let b = 0; b < totalBeats; b++) {
      const time = startTime + b * secPerBeat;
      const posInMeasure = b % beatsPerMeasure;
      const isAccent = posInMeasure === 0;
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

    var bpm, meter;
    if (activeAttemptIdx >= 0 && attempts[activeAttemptIdx] && attempts[activeAttemptIdx].settings) {
      const s = attempts[activeAttemptIdx].settings;
      meter = s.meter;
      bpm = s.bpm;
    } else {
      meter = "2/4";
      bpm = document.getElementById("bpmSelect").value;
    }
    const headerText = "G Major  |  " + meter + "  |  " + bpm + " BPM";

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

    const shareTitle = "Sight Reading Recording — G Major 2/4";

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
  const currentMeter = "2/4";
  let currentBpm = 60;
  const currentNumMeasures = 16;
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

    currentBpm = parseInt(document.getElementById("bpmSelect").value, 10);

    currentMeasures = generateMelody(currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm);

    const abc = melodyToAbc(currentMeasures);
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
      currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm);
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

    const abc = melodyToAbc(currentMeasures);
    render(abc);

    const countInBars = 2;
    recordMetronomeGain = audioCtx.createGain();
    recordMetronomeGain.connect(audioCtx.destination);
    scheduleMetronome(audioCtx, currentBpm, currentNumMeasures, countInBars, recordMetronomeGain);

    const secPerBeat = 60 / currentBpm;
    const beatsPerMeasure = 2;
    const countInBeats = countInBars * beatsPerMeasure;

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);

    recordingInterval = setInterval(function () {
      countUpBeat++;
      if (countUpBeat <= countInBeats) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("🎵 Recording...");
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
    }, secPerBeat * 1000);

    const countInMs = countInBeats * secPerBeat * 1000;
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

    const melodyDurationMs = currentNumMeasures * beatsPerMeasure * secPerBeat * 1000;
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
      keyLabel: "G Major",
      meter: currentMeter,
      bpm: currentBpm,
      difficulty: "level",
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
      key: "G Major",
      meter: currentMeter,
      bpm: currentBpm,
      difficulty: "level",
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
  // 16b. CHORD STRUM PLAYBACK (oscillator-based)
  // ==========================================================

  let playbackCtx = null;
  let playbackTimeouts = [];
  let isPlaying = false;
  let highlightedEl = null;
  let playbackMasterGain = null;
  let activeSources = [];
  const HIGHLIGHT_COLOR = "#00aaff";

  function scheduleChordStrum(chordName, audioTime, durationSec, quarterBeats, strumDir, ctx, dest) {
    const sampleKey = getSampleKey(quarterBeats, strumDir);
    const buf = sampleBuffers[chordName] && sampleBuffers[chordName][sampleKey];

    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 1.0;
      src.connect(g);
      g.connect(dest);
      src.start(audioTime);
      activeSources.push({ source: src, gain: g });
    } else {
      const chordDef = CHORD_DEFS[chordName];
      if (!chordDef) return;
      const tones = chordDef.tones;
      const strumSpread = 0.015;
      for (let t = 0; t < tones.length; t++) {
        const hz = midiToHz(tones[t]);
        const noteStart = audioTime + t * strumSpread;
        const noteEnd = noteStart + durationSec - t * strumSpread;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = hz;
        const noteGain = ctx.createGain();
        const vol = 0.08 / tones.length;
        noteGain.gain.setValueAtTime(0, noteStart);
        noteGain.gain.linearRampToValueAtTime(vol, noteStart + 0.005);
        noteGain.gain.exponentialRampToValueAtTime(vol * 0.4, noteStart + Math.min(0.3, noteEnd - noteStart));
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        osc.connect(noteGain);
        noteGain.connect(dest);
        osc.start(noteStart);
        osc.stop(noteEnd + 0.01);
        activeSources.push({ source: osc, gain: noteGain });
      }
    }
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

    await loadSamples(playbackCtx);

    playbackMasterGain = playbackCtx.createGain();
    playbackMasterGain.connect(playbackCtx.destination);
    activeSources = [];

    isPlaying = true;
    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "■ Stop";
    playBtn.classList.add("playing");

    document.getElementById("generateBtn").disabled = true;

    const secPerBeat = 60 / currentBpm;
    const beatsPerMeasure = 2;

    const countInBars = 2;
    const countInBeats = countInBars * beatsPerMeasure;
    const countInDuration = countInBeats * secPerBeat;

    const baseTime = playbackCtx.currentTime + 0.1;

    for (let b = 0; b < countInBeats; b++) {
      const time = baseTime + b * secPerBeat;
      const isAccent = b % beatsPerMeasure === 0;
      playClick(playbackCtx, time, isAccent, playbackMasterGain);
    }

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);
    const countInInterval = setInterval(function () {
      countUpBeat++;
      if (countUpBeat <= countInBeats) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("");
        clearInterval(countInInterval);
      }
    }, secPerBeat * 1000);
    playbackTimeouts.push(countInInterval);

    const melodyBaseTime = baseTime + countInDuration;
    const countInMs = countInDuration * 1000;

    const totalBeats = currentNumMeasures * beatsPerMeasure;
    for (let b = 0; b < totalBeats; b++) {
      const time = melodyBaseTime + b * secPerBeat;
      const posInMeasure = b % beatsPerMeasure;
      const isAccent = posInMeasure === 0;
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
        scheduleChordStrum(note.chordName, noteStart, note.duration * 0.9, note.quarterBeats || 1, note.strumDir || "d", playbackCtx, strumGain);
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

    const abc = melodyToAbc(currentMeasures);
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

  const SCORE_HISTORY_KEY = "sightreading-score-history-year2-level5";

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
          '<span class="history-entry-detail">G Major 2/4 ' + r.bpm + 'bpm</span>' +
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

    const bpmOpts = [50, 60, 70, 80];
    const bpm = bpmOpts[Math.floor(seededRandom() * bpmOpts.length)];

    document.getElementById("bpmSelect").value = String(bpm);
    currentBpm = bpm;

    seedPRNG(dateStr + "-melody");

    currentMeasures = generateMelody(currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm);

    const abc = melodyToAbc(currentMeasures);
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
