// ============================================================
// Sight Reading Generator for Classical Guitar — WITH RECORDING & SCORING
// Year 2 Level 6 — C Major & A Minor, 6/8 Hemiola
// Uses ABCjs for notation, Web Audio API for pitch detection (YIN)
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // 1. MUSIC THEORY DATA
  // ==========================================================

  const NOTE_NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
  const FLAT_NAMES = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"];

  // Year 2 Level 6 — C major & A natural minor, 6/8 hemiola
  // C Major: C4–G5, A natural minor: A3–G5 (no raised 7th)
  const KEY_DEFS = {
    "C":  { tonic: 60, mode: "major", abcKey: "C",  usesFlats: false,
            allowedPitches: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
            startPitches: [60, 67, 72],
            endPitches: [60, 72],
            vChordPCs: [7, 11, 2] },
    "Am": { tonic: 57, mode: "minor", abcKey: "Am", usesFlats: false,
            allowedPitches: [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
            startPitches: [57, 64, 69],
            endPitches: [60, 72],
            vChordPCs: [2, 4, 7, 11] },
  };

  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

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
    return keyDef.allowedPitches.slice();
  }

  function scaleDegree(midi, keyDef) {
    const pattern = keyDef.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
    const interval = ((midi - keyDef.tonic) % 12 + 12) % 12;
    return pattern.indexOf(interval);
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
  // 3. VOICE LEADING ENGINE (hemiola-specific rules)
  // ==========================================================

  function weightedPick(candidates) {
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = seededRandom() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.pitch;
    }
    return candidates[candidates.length - 1].pitch;
  }

  function pickNextPitch(prevPitch, prevInterval, scalePitches, keyDef, context) {
    const idx = scalePitches.indexOf(prevPitch);
    if (idx === -1) {
      return scalePitches.reduce((a, b) =>
        Math.abs(b - prevPitch) < Math.abs(a - prevPitch) ? b : a
      );
    }

    const maxScaleSteps = 4;
    const candidates = [];

    for (let i = 0; i < scalePitches.length; i++) {
      const pitch = scalePitches[i];
      const stepsAway = Math.abs(i - idx);
      if (stepsAway === 0 || stepsAway > maxScaleSteps) continue;

      let weight = 1.0;

      const isStep = stepsAway === 1;
      const isSkip = stepsAway >= 2;
      if (isStep) weight *= 3.0;
      else if (stepsAway === 2) weight *= 1.2;
      else if (stepsAway === 3) weight *= 0.6;
      else weight *= 0.3;

      if (prevInterval !== 0) {
        const prevDir = prevInterval > 0 ? 1 : -1;
        const curDir = i > idx ? 1 : -1;
        const prevWasSkip = Math.abs(prevInterval) >= 2;

        if (prevWasSkip) {
          if (isStep && curDir !== prevDir) weight *= 4.0;
          else if (isSkip && curDir === prevDir) {
            if (Math.abs(prevInterval) === 2 && stepsAway === 2) {
              weight *= 0.8;
            } else {
              weight *= 0.03;
            }
          }
        }

        if (Math.abs(prevInterval) > 2 && curDir !== prevDir) weight *= 1.8;
      }

      const semitonesAway = Math.abs(pitch - prevPitch);
      if (semitonesAway === 6) weight *= 0.05;

      if (context.isVChord) {
        const pc = pitch % 12;
        if (keyDef.vChordPCs.includes(pc)) weight *= 3.5;
      }

      if (context.contourPhase === "rising" && pitch > prevPitch) weight *= 1.4;
      if (context.contourPhase === "rising" && pitch < prevPitch) weight *= 0.7;
      if (context.contourPhase === "falling" && pitch < prevPitch) weight *= 1.4;
      if (context.contourPhase === "falling" && pitch > prevPitch) weight *= 0.7;

      if (context.beatIdx === 0) {
        const deg = scaleDegree(pitch, keyDef);
        if (deg === 0) weight *= 1.6;
        else if (deg === 4) weight *= 1.3;
        else if (deg === 2) weight *= 1.1;
      }

      const lo = scalePitches[0];
      const hi = scalePitches[scalePitches.length - 1];
      const mid = (lo + hi) / 2;
      weight *= Math.max(0.3, 1 - Math.abs(pitch - mid) / 20);

      candidates.push({ pitch, weight });
    }

    if (candidates.length === 0) {
      return scalePitches[Math.floor(seededRandom() * scalePitches.length)];
    }
    return weightedPick(candidates);
  }

  // ==========================================================
  // 4. RHYTHM GENERATION (6/8 and 3/4 hemiola patterns)
  // ==========================================================

  // Durations in quarter-beat units. 6/8 measure = 3 quarter beats.
  // eighth=0.5, quarter=1, dotted-quarter=1.5, half=2, dotted-half=3

  const RHYTHM_68 = [
    { pattern: [1.5, 1.5],                          weight: 12 },
    { pattern: [0.5, 0.5, 0.5, 1.5],                weight: 14 },
    { pattern: [1.5, 0.5, 0.5, 0.5],                weight: 14 },
    { pattern: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],      weight: 10 },
    { pattern: [1, 0.5, 1.5],                        weight: 10 },
    { pattern: [1.5, 1, 0.5],                        weight: 10 },
    { pattern: [1, 0.5, 0.5, 0.5, 0.5],              weight: 8  },
    { pattern: [0.5, 0.5, 0.5, 1, 0.5],              weight: 8  },
    { pattern: [1, 0.5, 1, 0.5],                     weight: 8  },
    { pattern: [0.5, 1, 1.5],                        weight: 6  },
  ];

  const RHYTHM_34 = [
    { pattern: [1, 1, 1],                            weight: 20 },
    { pattern: [2, 1],                                weight: 12 },
    { pattern: [1, 2],                                weight: 12 },
    { pattern: [1, 1, 0.5, 0.5],                     weight: 10 },
    { pattern: [0.5, 0.5, 1, 1],                     weight: 10 },
    { pattern: [1, 0.5, 0.5, 1],                     weight: 10 },
    { pattern: [0.5, 0.5, 0.5, 0.5, 1],              weight: 6  },
    { pattern: [1, 0.5, 0.5, 0.5, 0.5],              weight: 6  },
  ];

  function pickRhythmPattern(feel) {
    const pool = feel === "34" ? RHYTHM_34 : RHYTHM_68;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = seededRandom() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p.pattern.slice();
    }
    return pool[pool.length - 1].pattern.slice();
  }

  // ==========================================================
  // 5. MELODY GENERATION (8 measures, hemiola structure)
  // ==========================================================

  let currentMeasureFeels = [];

  function getContourPhase(measureIdx) {
    if (measureIdx <= 1) return "rising";
    if (measureIdx <= 3) return "falling";
    if (measureIdx <= 5) return "rising";
    return "falling";
  }

  function generateSequenceMeasure(sourceMeasure, scalePitches, startPitch, rhythm) {
    const intervals = [];
    for (let i = 1; i < sourceMeasure.length; i++) {
      const prevIdx = scalePitches.indexOf(sourceMeasure[i - 1].pitch);
      const curIdx = scalePitches.indexOf(sourceMeasure[i].pitch);
      if (prevIdx >= 0 && curIdx >= 0) intervals.push(curIdx - prevIdx);
      else intervals.push(0);
    }

    const notes = [];
    let curIdx = scalePitches.indexOf(startPitch);
    if (curIdx === -1) curIdx = Math.floor(scalePitches.length / 2);

    notes.push({ pitch: scalePitches[curIdx], duration: rhythm[0], isRest: false });

    for (let i = 0; i < intervals.length && i + 1 < rhythm.length; i++) {
      let nextIdx = curIdx + intervals[i];
      nextIdx = Math.max(0, Math.min(scalePitches.length - 1, nextIdx));
      curIdx = nextIdx;
      notes.push({ pitch: scalePitches[curIdx], duration: rhythm[i + 1], isRest: false });
    }

    for (let i = notes.length; i < rhythm.length; i++) {
      notes.push({ pitch: scalePitches[curIdx], duration: rhythm[i], isRest: false });
    }

    return notes;
  }

  function pickCadencePitch(currentPitch, scalePitches, keyDef) {
    const tonicPC = keyDef.tonic % 12;
    const endPitches = keyDef.endPitches;
    const closestEnd = endPitches.reduce((a, b) =>
      Math.abs(b - currentPitch) < Math.abs(a - currentPitch) ? b : a
    );

    const candidates = scalePitches.filter(p => {
      const deg = scaleDegree(p, keyDef);
      const dist = Math.abs(p - closestEnd);
      if (deg === 4 && dist <= 7) return true;
      if (deg === 1 && p > closestEnd && dist <= 4) return true;
      if (deg === 6 && dist <= 4) return true;
      return false;
    });

    if (candidates.length > 0) {
      return candidates.reduce((a, b) =>
        Math.abs(b - currentPitch) < Math.abs(a - currentPitch) ? b : a
      );
    }

    const stepAbove = scalePitches.find(p => p > closestEnd && Math.abs(p - closestEnd) <= 3);
    const stepBelow = scalePitches.filter(p => p < closestEnd && Math.abs(p - closestEnd) <= 3).pop();
    return stepAbove || stepBelow || currentPitch;
  }

  function generateMelody(keyName, meter, difficulty, numMeasures) {
    const keyDef = KEY_DEFS[keyName];
    const scalePitches = getScalePitches(keyDef);

    const feels = [];
    for (let m = 0; m < numMeasures; m++) {
      if (m === 1 || m === 3 || m === 6) {
        feels.push("34");
      } else if (m === numMeasures - 1) {
        feels.push("68");
      } else {
        feels.push(seededRandom() < 0.2 ? "34" : "68");
      }
    }
    currentMeasureFeels = feels;

    let currentPitch = keyDef.startPitches[
      Math.floor(seededRandom() * keyDef.startPitches.length)
    ];
    let prevInterval = 0;
    const measures = [];

    for (let m = 0; m < numMeasures; m++) {
      const isLast = m === numMeasures - 1;
      const isVChord = m === 3 || m === 6;
      const contourPhase = getContourPhase(m);

      if (isLast) {
        const endPitch = keyDef.endPitches.reduce((a, b) =>
          Math.abs(b - currentPitch) < Math.abs(a - currentPitch) ? b : a
        );
        measures.push([{ pitch: endPitch, duration: 3, isRest: false }]);
        continue;
      }

      const rhythm = pickRhythmPattern(feels[m]);

      if (m === 5 && measures.length >= 5 && seededRandom() < 0.6) {
        const transposeDist = seededRandom() < 0.5 ? -1 : (seededRandom() < 0.5 ? -2 : 1);
        const sourceLastPitch = measures[4][measures[4].length - 1].pitch;
        const srcIdx = scalePitches.indexOf(sourceLastPitch);
        let seqStartIdx = srcIdx + transposeDist;
        seqStartIdx = Math.max(0, Math.min(scalePitches.length - 1, seqStartIdx));
        const firstPitchOfSource = measures[4][0].pitch;
        const firstSrcIdx = scalePitches.indexOf(firstPitchOfSource);
        let seqFirstIdx = firstSrcIdx + transposeDist;
        seqFirstIdx = Math.max(0, Math.min(scalePitches.length - 1, seqFirstIdx));

        const seqNotes = generateSequenceMeasure(
          measures[4], scalePitches, scalePitches[seqFirstIdx], rhythm
        );
        measures.push(seqNotes);
        const lastSeq = seqNotes[seqNotes.length - 1];
        currentPitch = lastSeq.pitch;
        prevInterval = 0;
        continue;
      }

      const notes = [];

      for (let n = 0; n < rhythm.length; n++) {
        const dur = rhythm[n];

        if (m === 0 && n === 0) {
          notes.push({ pitch: currentPitch, duration: dur, isRest: false });
          continue;
        }

        if (m === numMeasures - 2 && n === rhythm.length - 1) {
          const cadencePitch = pickCadencePitch(currentPitch, scalePitches, keyDef);
          prevInterval = scalePitches.indexOf(cadencePitch) - scalePitches.indexOf(currentPitch);
          currentPitch = cadencePitch;
          notes.push({ pitch: cadencePitch, duration: dur, isRest: false });
          continue;
        }

        const context = {
          measureIdx: m,
          beatIdx: n,
          isVChord: isVChord,
          contourPhase: contourPhase,
        };

        const nextPitch = pickNextPitch(currentPitch, prevInterval, scalePitches, keyDef, context);
        prevInterval = scalePitches.indexOf(nextPitch) - scalePitches.indexOf(currentPitch);
        currentPitch = nextPitch;
        notes.push({ pitch: nextPitch, duration: dur, isRest: false });
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
    let abc = "X:1\nM:" + meter + "\nL:1/8\n%%stretchlast true\nK:" + keyDef.abcKey + "\n";

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      const feel = currentMeasureFeels[i] || "68";
      const accState = {};
      let beatPosEighths = 0;

      if (i === 0) abc += "|:";

      for (let j = 0; j < measure.length; j++) {
        const note = measure[j];
        const durEighths = Math.round(note.duration * 2);

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
        if (nextNote) {
          const nextBeatPosEighths = beatPosEighths + durEighths;
          const nextDurEighths = Math.round(nextNote.duration * 2);
          const isSubBeat = durEighths < 3;
          const nextIsSubBeat = nextDurEighths < 3;

          let sameGroup = false;
          if (isSubBeat && nextIsSubBeat) {
            if (feel === "34") {
              const curGroup = Math.floor(beatPosEighths / 2);
              const nextGroup = Math.floor(nextBeatPosEighths / 2);
              sameGroup = curGroup === nextGroup;
            } else {
              const curGroup = Math.floor(beatPosEighths / 3);
              const nextGroup = Math.floor(nextBeatPosEighths / 3);
              sameGroup = curGroup === nextGroup;
            }
          }

          if (!sameGroup) abc += " ";
        }

        beatPosEighths += durEighths;
      }

      if (i === measures.length - 1) abc += ":|";
      else if (i === 3) abc += "|\n";
      else abc += "| ";
    }
    return abc;
  }

  // BPM = dotted-quarter (compound beat) BPM
  // secPerQuarterBeat = 40 / bpm
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
          });
        } else if (note.pitch != null) {
          notes.push({
            midi: note.pitch,
            name: midiToNoteName(note.pitch),
            startTime: time,
            duration: note.duration * secPerQuarterBeat,
            quarterBeats: note.duration,
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
  // 9. METRONOME (6/8 — click every eighth, accent compound beats)
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
    const secPerCompoundBeat = 60 / bpm;
    const secPerEighth = secPerCompoundBeat / 3;
    const eighthsPerMeasure = 6;
    const totalBars = countInBars + numMeasures;
    const totalEighths = totalBars * eighthsPerMeasure;
    const startTime = audioCtx.currentTime + 0.1;
    const countInDuration = countInBars * eighthsPerMeasure * secPerEighth;

    for (let e = 0; e < totalEighths; e++) {
      const time = startTime + e * secPerEighth;
      const isAccent = (e % 3) === 0;
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
  // 11. SCORING ENGINE
  // ==========================================================

  function scoreMelody(expected, detected, recordingDuration) {
    const results = expected.map(e => ({
      expected: e,
      matched: false,
      detectedNote: null,
      pitchCorrect: false,
      evaluated: false,
    }));

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

    svgContainer.querySelectorAll(".pitch-arrow").forEach(a => a.remove());

    const allEls = svgContainer.querySelectorAll(".abcjs-note, .abcjs-rest");
    let idx = 0;

    for (const el of allEls) {
      if (idx >= scoreResults.results.length) break;
      const result = scoreResults.results[idx];

      let color;
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

      if (!result.expected.isRest && result.matched && !result.pitchCorrect && result.detectedNote && svg) {
        const direction = pitchDirection(result.expected.midi, result.detectedNote.midi);
        if (direction !== 0) {
          addPitchArrow(svg, el, color, direction);
        }
      }

      idx++;
    }
  }

  function pitchDirection(expectedMidi, detectedMidi) {
    const expPC = expectedMidi % 12;
    const detPC = detectedMidi % 12;
    let diff = detPC - expPC;
    if (diff > 6) diff -= 12;
    if (diff <= -6) diff += 12;
    if (Math.abs(diff) <= 0.5) return 0;
    return diff > 0 ? 1 : -1;
  }

  function addPitchArrow(svg, noteEl, color, direction) {
    const bbox = noteEl.getBBox();
    const cx = bbox.x + bbox.width / 2;

    const arrowSize = 6;
    const gap = 4;

    let points;
    if (direction > 0) {
      const tipY = bbox.y - gap;
      points = (cx) + "," + (tipY) + " " +
               (cx - arrowSize) + "," + (tipY + arrowSize) + " " +
               (cx + arrowSize) + "," + (tipY + arrowSize);
    } else {
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

    const svgImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
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

    let keyLabel, meterVal, bpm, diff;
    if (activeAttemptIdx >= 0 && attempts[activeAttemptIdx] && attempts[activeAttemptIdx].settings) {
      const s = attempts[activeAttemptIdx].settings;
      keyLabel = s.keyLabel;
      meterVal = s.meter;
      bpm = s.bpm;
      diff = s.difficulty;
    } else {
      keyLabel = document.getElementById("keySelect").selectedOptions[0].text;
      meterVal = document.getElementById("meterSelect").value;
      bpm = document.getElementById("bpmSelect").value;
      diff = document.getElementById("difficultySelect").value;
    }
    const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
    const headerText = keyLabel + "  |  " + meterVal + "  |  " + bpm + " BPM  |  " + diffLabel;
    ctx.fillStyle = "#333";
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(headerText, canvasW / 2, padding + 16);

    if (isDaily) {
      const badgeText = "🌟 Daily Challenge — " + dailyDate;
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

    return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
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

    let keyLabel = "";
    let meterVal = "";
    if (attempt.settings) {
      keyLabel = attempt.settings.keyLabel;
      meterVal = attempt.settings.meter;
    }
    const shareTitle = "Sight Reading Recording — " + keyLabel + " " + meterVal;

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
  let currentKeyDef = null;
  let currentMeter = null;
  let currentBpm = 60;
  let currentNumMeasures = 8;
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

    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
    render(abc);

    const countInBars = 1;
    recordMetronomeGain = audioCtx.createGain();
    recordMetronomeGain.connect(audioCtx.destination);
    scheduleMetronome(audioCtx, currentBpm, currentMeter, currentNumMeasures, countInBars, recordMetronomeGain);

    const secPerCompoundBeat = 60 / currentBpm;
    const secPerEighth = secPerCompoundBeat / 3;
    const countInEighths = countInBars * 6;

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);

    recordingInterval = setInterval(() => {
      countUpBeat++;
      if (countUpBeat <= countInEighths) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("Recording...");
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
    }, secPerEighth * 1000);

    const countInMs = countInEighths * secPerEighth * 1000;
    recordingTimeouts.push(setTimeout(() => {
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
          const tid = setTimeout(() => {
            if (!recordingActive) return;
            highlightElement(allEls[i]);
          }, note.startTime * 1000);
          recordingTimeouts.push(tid);
        }
      }
    }, countInMs));

    const secPerQuarterBeat = 40 / currentBpm;
    const melodyDurationMs = currentNumMeasures * 3 * secPerQuarterBeat * 1000;
    const totalWaitMs = countInMs + melodyDurationMs + 500;

    recordingTimeouts.push(setTimeout(() => {
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
    attempts.push({ scoreResult, settings: attemptSettings });
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
  // 16b. MELODY PLAYBACK (6/8 — dotted-quarter BPM)
  // ==========================================================

  let playbackCtx = null;
  let playbackTimeouts = [];
  let isPlaying = false;
  let highlightedEl = null;
  let playbackMasterGain = null;
  let activeSources = [];
  const HIGHLIGHT_COLOR = "#00aaff";

  const MIDI_SAMPLE_MAP = {
    57: "audio/A.mp3",
    59: "audio/B.mp3",
    60: "audio/C1.mp3",
    62: "audio/D1.wav",
    64: "audio/E1.wav",
    65: "audio/F1.wav",
    67: "audio/G1.wav",
    69: "audio/A1.wav",
    71: "audio/B1.mp3",
    72: "audio/C2.wav",
    74: "audio/D2.wav",
    76: "audio/E2.wav",
    77: "audio/F2.mp3",
    79: "audio/G2.wav",
  };

  const sampleBuffers = {};
  let samplesLoaded = false;

  async function loadSampleBuffers(ctx) {
    if (samplesLoaded) return;
    const entries = Object.entries(MIDI_SAMPLE_MAP);
    await Promise.all(entries.map(async function ([midi, url]) {
      const fullUrl = new URL(url, window.location.href).href;
      try {
        const resp = await fetch(fullUrl);
        if (!resp.ok) {
          console.error("Audio load failed: HTTP " + resp.status + " for " + fullUrl);
          return;
        }
        const arrayBuf = await resp.arrayBuffer();
        sampleBuffers[midi] = await ctx.decodeAudioData(arrayBuf);
      } catch (e) {
        console.error("Audio load failed for " + fullUrl, e);
      }
    }));
    samplesLoaded = true;
  }

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function scheduleNote(midi, audioTime, durationSec, ctx, dest) {
    const buf = sampleBuffers[midi];
    if (!buf) return;

    const source = ctx.createBufferSource();
    source.buffer = buf;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(1.0, audioTime);
    const fadeStart = audioTime + durationSec - 0.05;
    noteGain.gain.setValueAtTime(1.0, fadeStart);
    noteGain.gain.linearRampToValueAtTime(0, audioTime + durationSec);

    source.connect(noteGain);
    noteGain.connect(dest);
    source.start(audioTime);
    source.stop(audioTime + durationSec + 0.01);
    activeSources.push({ source, gain: noteGain });
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

    await loadSampleBuffers(playbackCtx);

    playbackMasterGain = playbackCtx.createGain();
    playbackMasterGain.connect(playbackCtx.destination);
    activeSources = [];

    isPlaying = true;
    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "■ Stop";
    playBtn.classList.add("playing");

    document.getElementById("generateBtn").disabled = true;

    const secPerCompoundBeat = 60 / currentBpm;
    const secPerEighth = secPerCompoundBeat / 3;
    const eighthsPerMeasure = 6;

    const countInBars = 1;
    const countInEighths = countInBars * eighthsPerMeasure;
    const countInDuration = countInEighths * secPerEighth;

    const baseTime = playbackCtx.currentTime + 0.1;

    for (let e = 0; e < countInEighths; e++) {
      const time = baseTime + e * secPerEighth;
      playClick(playbackCtx, time, (e % 3) === 0, playbackMasterGain);
    }

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);
    const countInInterval = setInterval(() => {
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

    const totalEighths = currentNumMeasures * eighthsPerMeasure;
    for (let e = 0; e < totalEighths; e++) {
      const time = melodyBaseTime + e * secPerEighth;
      playClick(playbackCtx, time, (e % 3) === 0, playbackMasterGain);
    }

    const allEls = getAllNoteRestEls();

    const sampleGain = playbackCtx.createGain();
    sampleGain.connect(playbackMasterGain);

    for (let i = 0; i < currentExpectedNotes.length; i++) {
      const note = currentExpectedNotes[i];
      const noteStart = melodyBaseTime + note.startTime;

      if (!note.isRest && note.midi != null) {
        scheduleNote(note.midi, noteStart - 0.09, note.duration * 0.9, playbackCtx, sampleGain);
      }

      if (i < allEls.length) {
        const highlightDelay = countInMs + note.startTime * 1000;
        const tid = setTimeout(() => {
          if (!isPlaying) return;
          highlightElement(allEls[i]);
        }, highlightDelay + 100);
        playbackTimeouts.push(tid);
      }
    }

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
      btn.addEventListener("click", () => switchAttempt(i));
      container.appendChild(btn);
    }
  }

  function switchAttempt(idx) {
    if (idx < 0 || idx >= attempts.length) return;
    activeAttemptIdx = idx;

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

  const SCORE_HISTORY_KEY = "sightreading-score-history-year2-level6";

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

    const counts = ranges.map(() => 0);
    for (const e of history) {
      if (e.stoppedEarly) counts[5]++;
      else if (e.score === 100) counts[0]++;
      else if (e.score >= 90) counts[1]++;
      else if (e.score >= 75) counts[2]++;
      else if (e.score >= 60) counts[3]++;
      else counts[4]++;
    }

    const maxCount = Math.max(...counts, 1);

    let html = '<h2 class="history-title">Score History</h2>';
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
        const dateStr = r.date ? new Date(r.date).toLocaleDateString() : "";
        const scoreColor = r.stoppedEarly ? "#777"
          : r.score === 100 ? "#FFD000"
          : r.score >= 90 ? "#27ae60"
          : r.score >= 75 ? "#2980b9"
          : r.score >= 60 ? "#e8a317"
          : "#c0392b";
        html += '<div class="history-entry">' +
          '<span class="history-entry-score" style="color:' + scoreColor + '">' +
            (r.stoppedEarly ? "DNF" : r.score + "%") +
          '</span>' +
          '<span class="history-entry-detail">' + escHtml(r.key) + ' ' + escHtml(r.meter) + ' ' + escHtml(r.difficulty) + ' ' + r.bpm + 'bpm</span>' +
          '<span class="history-entry-date">' + dateStr + '</span>' +
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

    const keys = Object.keys(KEY_DEFS);
    const diffs = Array.from(document.getElementById("difficultySelect").options).map(o => o.value);
    const meters = Array.from(document.getElementById("meterSelect").options).map(o => o.value);
    const bpmOpts = [50, 60, 70, 80];

    const keyName = keys[Math.floor(seededRandom() * keys.length)];
    const difficulty = diffs[Math.floor(seededRandom() * diffs.length)];
    const meter = meters[Math.floor(seededRandom() * meters.length)];
    const numMeasures = 8;
    const bpm = bpmOpts[Math.floor(seededRandom() * bpmOpts.length)];

    document.getElementById("keySelect").value = keyName;
    document.getElementById("meterSelect").value = meter;
    document.getElementById("difficultySelect").value = difficulty;
    document.getElementById("measuresSelect").value = String(numMeasures);
    document.getElementById("bpmSelect").value = String(bpm);

    currentMeter = meter;
    currentNumMeasures = numMeasures;
    currentBpm = bpm;
    currentKeyDef = KEY_DEFS[keyName];

    seedPRNG(dateStr + "-melody");

    currentMeasures = generateMelody(keyName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);

    const abc = melodyToAbc(currentMeasures, currentKeyDef, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();

    currentIsDaily = true;
    currentDailyDate = dateStr;
    document.getElementById("playBtn").disabled = false;
    document.getElementById("dailyBanner").textContent = "Daily Challenge — " + dateStr;
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
  const _dailyBtn = document.getElementById("dailyChallengeBtn");
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
