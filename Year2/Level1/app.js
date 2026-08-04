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

  // Year 2 Level 1 — C major & A minor, arpeggios on strings 4-3-2
  const KEY_DEFS = {
    "C":  { tonic: 60, mode: "major", abcKey: "C",  usesFlats: false },
    "Am": { tonic: 57, mode: "minor", abcKey: "Am", usesFlats: false },
  };

  // Chord voicings: [string4 (p), string3 (i), string2 (m)] as MIDI numbers
  // String 4: D4=62, E4=64, F4=65   String 3: G4=67, G#4=68, A4=69   String 2: B4=71, C5=72, D5=74
  const CHORD_VOICINGS = {
    "C":  [64, 67, 72],  // E4-G4-C5
    "F":  [65, 69, 72],  // F4-A4-C5
    "Am": [64, 69, 72],  // E4-A4-C5
    "Dm": [62, 69, 74],  // D4-A4-D5
    "G":  [62, 67, 71],  // D4-G4-B4
    "G7": [65, 67, 71],  // F4-G4-B4
    "Bo": [62, 68, 71],  // D4-G#4-B4
    "E":  [64, 68, 71],  // E4-G#4-B4
    "E7": [64, 68, 74],  // E4-G#4-D5
  };

  const STRING4_NOTES = [62, 64, 65]; // D4, E4, F4

  // Harmonic floor plans — each measure maps to one or more chord choices
  const FLOOR_PLANS = {
    "C": {
      4: [["C"],       ["F", "Dm"], ["G", "G7"], ["C"]],
      8: [["C"],       ["F", "Dm"], ["C"],       ["G", "G7"],
          ["C", "Am"], ["F", "Dm"], ["G", "G7"], ["C"]],
    },
    "Am": {
      4: [["Am"],      ["E", "Bo"], ["E", "E7"], ["Am"]],
      8: [["Am"],      ["E", "Bo"], ["Am"],      ["E", "E7"],
          ["Am"],      ["F", "Dm"], ["Am", "E", "E7"], ["Am"]],
    },
  };

  const RANGE_LOW  = 62;  // D4
  const RANGE_HIGH = 74;  // D5

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

  // ==========================================================
  // 3. BEAT PATTERN ENGINE
  // ==========================================================

  // Right-hand finger patterns and their rhythmic durations (in quarter beats)
  // p = string 4 (thumb), i = string 3 (index), m = string 2 (middle)
  const BEAT_PATTERNS = [
    { id: "Q",    durs: [1],                           strings: [4],          weight: 10 },
    { id: "EE",   durs: [0.5, 0.5],                    strings: [4, 4],       weight: 15 },
    { id: "ESS",  durs: [0.5, 0.25, 0.25],             strings: [4, 3, 2],    weight: 40 },
    { id: "SSSS", durs: [0.25, 0.25, 0.25, 0.25],      strings: [4, 3, 2, 3], weight: 35 },
  ];

  function pickBeatPattern() {
    const total = BEAT_PATTERNS.reduce((s, p) => s + p.weight, 0);
    let r = seededRandom() * total;
    for (const p of BEAT_PATTERNS) {
      r -= p.weight;
      if (r <= 0) return p;
    }
    return BEAT_PATTERNS[BEAT_PATTERNS.length - 1];
  }

  function pickStepNeighbor(basePitch) {
    const idx = STRING4_NOTES.indexOf(basePitch);
    if (idx === -1) return basePitch;
    const neighbors = [];
    if (idx > 0) neighbors.push(STRING4_NOTES[idx - 1]);
    if (idx < STRING4_NOTES.length - 1) neighbors.push(STRING4_NOTES[idx + 1]);
    if (neighbors.length === 0) return basePitch;
    return neighbors[Math.floor(seededRandom() * neighbors.length)];
  }

  function assignNotesToBeat(pattern, chord) {
    const notes = [];
    for (let i = 0; i < pattern.durs.length; i++) {
      let pitch;
      const str = pattern.strings[i];
      if (str === 4) {
        if (pattern.id === "EE" && i === 1) {
          pitch = pickStepNeighbor(chord[0]);
        } else {
          pitch = chord[0];
        }
      } else if (str === 3) {
        pitch = chord[1];
      } else {
        pitch = chord[2];
      }
      notes.push({ pitch: pitch, duration: pattern.durs[i], isRest: false });
    }
    return notes;
  }

  // ==========================================================
  // 4. MELODY GENERATION (arpeggio-based, 2/4)
  // ==========================================================

  function generateMelody(keyName, meter, difficulty, numMeasures) {
    const plans = FLOOR_PLANS[keyName];
    const plan = plans[numMeasures] || plans[8];
    const measures = [];

    for (let m = 0; m < numMeasures; m++) {
      const isLast = m === numMeasures - 1;
      const chordOptions = plan[m % plan.length];
      const chordName = chordOptions[Math.floor(seededRandom() * chordOptions.length)];
      const chord = CHORD_VOICINGS[chordName];

      if (isLast) {
        const keyDef = KEY_DEFS[keyName];
        const tonicPC = keyDef.tonic % 12;
        const tonicPitch = RANGE_LOW + ((tonicPC - RANGE_LOW % 12) + 12) % 12;
        const str4 = chord[0], str3 = chord[1], str2 = chord[2];
        const pattern = Math.floor(seededRandom() * 9);
        let finalNotes;
        switch (pattern) {
          case 0: // ESS + Q on str2 (always tied: last ESS note = str2 = Q pitch)
            finalNotes = [
              { pitch: str4, duration: 0.5, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false, tie: true },
              { pitch: str2, duration: 1.0, isRest: false },
            ];
            break;
          case 1: // ESS + Q on tonic (tied when tonic = str2)
            finalNotes = [
              { pitch: str4, duration: 0.5, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false, tie: str2 === tonicPitch },
              { pitch: tonicPitch, duration: 1.0, isRest: false },
            ];
            break;
          case 2: // SSSS + Q on str2 (no tie: last SSSS note = str3 ≠ str2)
            finalNotes = [
              { pitch: str4, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 1.0, isRest: false },
            ];
            break;
          case 3: // SSSS + Q on tonic (tied when tonic = str3)
            finalNotes = [
              { pitch: str4, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false, tie: str3 === tonicPitch },
              { pitch: tonicPitch, duration: 1.0, isRest: false },
            ];
            break;
          case 4: // Full measure of 16th arpeggiation on tonic chord
            finalNotes = [
              { pitch: str4, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str4, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
              { pitch: str2, duration: 0.25, isRest: false },
              { pitch: str3, duration: 0.25, isRest: false },
            ];
            break;
          case 5: // Labeled half note on tonic with chord name
            finalNotes = [{ pitch: tonicPitch, duration: 2, isRest: false, annotation: keyName }];
            break;
          case 6: // Q on bass (str4) + Q on tonic
            finalNotes = [
              { pitch: str4, duration: 1.0, isRest: false },
              { pitch: tonicPitch, duration: 1.0, isRest: false },
            ];
            break;
          case 7: // Quarter rest + quarter on tonic
            finalNotes = [
              { pitch: null, duration: 1.0, isRest: true },
              { pitch: tonicPitch, duration: 1.0, isRest: false },
            ];
            break;
          case 8: // Dyad: str4 + tonic as half note
            finalNotes = [{ pitch: tonicPitch, duration: 2, isRest: false, chordPitch: str4 }];
            break;
        }
        measures.push(finalNotes);
        continue;
      }

      // Pick two beat patterns (one per beat in 2/4)
      let beat1 = pickBeatPattern();
      let beat2 = pickBeatPattern();

      // Ensure at least one arpeggio pattern per measure
      if (beat1.id !== "ESS" && beat1.id !== "SSSS" &&
          beat2.id !== "ESS" && beat2.id !== "SSSS") {
        beat2 = seededRandom() < 0.5
          ? BEAT_PATTERNS[2]   // ESS
          : BEAT_PATTERNS[3];  // SSSS
      }

      const notes = assignNotesToBeat(beat1, chord)
                     .concat(assignNotesToBeat(beat2, chord));
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
    // dur in quarter-beat units; L:1/16 → multiply by 4 for sixteenth counts
    const sixteenths = Math.round(dur * 4);
    if (sixteenths === 1) return "";
    return String(sixteenths);
  }

  function melodyToAbc(measures, keyDef, meter) {
    let abc = "X:1\nM:" + meter + "\nL:1/16\n%%stretchlast true\nK:" + keyDef.abcKey + "\n";
    const sixteenthsPerBeat = 4;

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      const accState = {};
      let posSixteenths = 0;

      for (let j = 0; j < measure.length; j++) {
        const note = measure[j];
        const durSixteenths = Math.round(note.duration * 4);

        if (note.isRest) {
          abc += "z" + durationToAbc(note.duration);
        } else {
          if (note.annotation) abc += '"' + note.annotation + '"';
          let noteAbc = midiToAbc(note.pitch, keyDef);
          let acc = "";
          let base = noteAbc;
          if (/^[\^_=]/.test(noteAbc)) { acc = noteAbc[0]; base = noteAbc.slice(1); }
          const cur = accState[base] || "";
          if (acc === cur) noteAbc = base;
          else if (acc === "" && cur !== "") { noteAbc = "=" + base; accState[base] = ""; }
          else accState[base] = acc;
          if (note.chordPitch != null) {
            let chordAbc = midiToAbc(note.chordPitch, keyDef);
            let cAcc = "";
            let cBase = chordAbc;
            if (/^[\^_=]/.test(chordAbc)) { cAcc = chordAbc[0]; cBase = chordAbc.slice(1); }
            const cCur = accState[cBase] || "";
            if (cAcc === cCur) chordAbc = cBase;
            else if (cAcc === "" && cCur !== "") { chordAbc = "=" + cBase; accState[cBase] = ""; }
            else accState[cBase] = cAcc;
            abc += "[" + chordAbc + noteAbc + "]" + durationToAbc(note.duration);
          } else {
            abc += noteAbc + durationToAbc(note.duration);
          }
          if (note.tie) abc += "-";
        }

        // Beaming: no space within a beat, space between beats
        const nextNote = measure[j + 1];
        if (nextNote) {
          const nextPosSixteenths = posSixteenths + durSixteenths;
          const curBeatIdx = Math.floor(posSixteenths / sixteenthsPerBeat);
          const nextBeatIdx = Math.floor(nextPosSixteenths / sixteenthsPerBeat);
          const isSubBeat = durSixteenths < sixteenthsPerBeat;
          const nextIsSubBeat = Math.round(nextNote.duration * 4) < sixteenthsPerBeat;

          if (isSubBeat && nextIsSubBeat && curBeatIdx === nextBeatIdx) {
            // beam together
          } else {
            abc += " ";
          }
        }

        posSixteenths += durSixteenths;
      }

      abc += (i === measures.length - 1) ? "|]" : "| ";
    }
    return abc;
  }

  // Build a flat list of expected MIDI note numbers (skipping rests) with timing info
  function buildExpectedNotes(measures, bpm, meter) {
    const beatsPerMeasure = parseInt(meter, 10);
    const secPerBeat = 60 / bpm;
    const notes = [];
    let time = 0;
    let prevTied = false;

    for (const measure of measures) {
      for (const note of measure) {
        if (note.isRest) {
          prevTied = false;
          notes.push({
            isRest: true,
            midi: null,
            name: "rest",
            startTime: time,
            duration: note.duration * secPerBeat,
            quarterBeats: note.duration,
          });
        } else if (note.pitch != null) {
          const prev = notes.length > 0 ? notes[notes.length - 1] : null;
          if (prevTied && prev && !prev.isRest && prev.midi === note.pitch) {
            prev.duration += note.duration * secPerBeat;
            prev.quarterBeats += note.duration;
          } else {
            notes.push({
              midi: note.pitch,
              name: midiToNoteName(note.pitch),
              startTime: time,
              duration: note.duration * secPerBeat,
              quarterBeats: note.duration,
            });
          }
          prevTied = !!note.tie;
        }
        time += note.duration * secPerBeat;
      }
    }
    return notes;
  }

  // Global index counter so ABCjs note classes line up with our expectedNotes
  function buildNoteIndexMap(measures) {
    const map = [];
    let idx = 0;
    let prevTied = false;
    for (const measure of measures) {
      for (const note of measure) {
        if (!note.isRest && note.pitch != null) {
          if (prevTied) {
            map.push(map[map.length - 1]);
          } else {
            map.push(idx++);
          }
          prevTied = !!note.tie;
        } else {
          map.push(-1);
          prevTied = false;
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
    const beatsPerMeasure = parseInt(meter, 10);
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

    // Draw daily challenge badge if applicable
    if (isDaily) {
      const badgeText = "\uD83C\uDF1F Daily Challenge \u2014 " + dailyDate;
      ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
      const textW = ctx.measureText(badgeText).width;
      const badgePadX = 14;
      const badgePadY = 6;
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
  let currentBpm = 80;
  let currentNumMeasures = 8;
  let currentMode = null;
  let currentIsDaily = false;
  let currentDailyDate = "";

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

    const beatsPerMeasure = parseInt(currentMeter, 10);
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
        isDaily: currentIsDaily,
        dailyDate: currentDailyDate,
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
  let playbackMasterGain = null;
  let activeSources = [];
  const HIGHLIGHT_COLOR = "#00aaff";

  // --- Audio sample mapping: MIDI → filename (D4–D5 range for strings 4-3-2) ---
  const MIDI_SAMPLE_MAP = {
    62: "audio/D1.wav",          // D4
    64: "audio/E1.wav",          // E4
    65: "audio/F1.wav",          // F4
    67: "audio/G1.wav",          // G4
    68: "audio/Gs1-Ab1.mp3",     // G#4/Ab4
    69: "audio/A1.wav",          // A4
    71: "audio/B1.mp3",          // B4
    72: "audio/C2.wav",          // C5
    74: "audio/D2.wav",          // D5
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

  /** Schedule a sampled guitar note via AudioBufferSourceNode. */
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
    playBtn.textContent = "\u25A0 Stop";
    playBtn.classList.add("playing");

    // Disable other buttons during playback
    document.getElementById("generateBtn").disabled = true;

    const beatsPerMeasure = parseInt(currentMeter, 10);
    const secPerBeat = 60 / currentBpm;

    // --- Count-in (1 bar) ---
    const countInBars = 1;
    const countInBeats = countInBars * beatsPerMeasure;
    const countInDuration = countInBeats * secPerBeat;

    const baseTime = playbackCtx.currentTime + 0.1;

    // Schedule count-in clicks
    for (let beat = 0; beat < countInBeats; beat++) {
      const time = baseTime + beat * secPerBeat;
      playClick(playbackCtx, time, beat === 0, playbackMasterGain);
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
      playClick(playbackCtx, time, (beat % beatsPerMeasure) === 0, playbackMasterGain);
    }

    const allEls = getAllNoteRestEls();

    // Gain node for sample playback — routed through master so stopPlayback can kill it
    const sampleGain = playbackCtx.createGain();
    sampleGain.connect(playbackMasterGain);

    for (let i = 0; i < currentExpectedNotes.length; i++) {
      const note = currentExpectedNotes[i];
      const noteStart = melodyBaseTime + note.startTime;

      // Schedule audio for pitched notes via sampled guitar buffer
      // Advance audio so the perceived attack lands on the beat
      // (samples have pre-transient silence + decode/playback latency)
      if (!note.isRest && note.midi != null) {
        scheduleNote(note.midi, noteStart - 0.09, note.duration * 0.9, playbackCtx, sampleGain);
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

    // Smooth 50ms fade-out on master gain, then disconnect (keeps ctx + sample cache alive)
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

  const SCORE_HISTORY_KEY = "sightreading-score-history-year2-level1";

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
      { label: "A (90\u201399%)", cls: "grade-a" },
      { label: "B (75\u201389%)", cls: "grade-b" },
      { label: "C (60\u201374%)", cls: "grade-c" },
      { label: "D (0\u201359%)", cls: "grade-d" },
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

    // Pick settings deterministically from the seed. Difficulty and meter
    // are pulled from the level's DOM options so the daily challenge stays
    // inside what this level allows; keys come from the level's KEY_DEFS.
    const keys = Object.keys(KEY_DEFS);
    const diffs = Array.from(document.getElementById("difficultySelect").options).map(o => o.value);
    const meters = Array.from(document.getElementById("meterSelect").options).map(o => o.value);
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

    currentIsDaily = true;
    currentDailyDate = dateStr;
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