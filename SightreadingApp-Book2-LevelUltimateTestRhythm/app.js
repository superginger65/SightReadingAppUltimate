// ============================================================
// Lead Sheet Rhythm Generator for Classical Guitar
// Uses ABCjs for notation, Web Audio API for rhythm detection
// ============================================================

(function () {
  "use strict";

  // ==========================================================
  // 1. CHORD & KEY DATA
  // ==========================================================

  const KEY_CHORDS = {
    "C":  { mode: "major", chords: ["C", "Dm", "Em", "F", "G", "Am", "Bdim"], abcKey: "C" },
    "G":  { mode: "major", chords: ["G", "Am", "Bm", "C", "D", "Em", "F#dim"], abcKey: "G" },
    "D":  { mode: "major", chords: ["D", "Em", "F#m", "G", "A", "Bm", "C#dim"], abcKey: "D" },
    "A":  { mode: "major", chords: ["A", "Bm", "C#m", "D", "E", "F#m", "G#dim"], abcKey: "A" },
    "F":  { mode: "major", chords: ["F", "Gm", "Am", "Bb", "C", "Dm", "Edim"], abcKey: "F" },
    "Bb": { mode: "major", chords: ["Bb", "Cm", "Dm", "Eb", "F", "Gm", "Adim"], abcKey: "Bb" },
    "Am": { mode: "minor", chords: ["Am", "Bdim", "C", "Dm", "E", "F", "G"], abcKey: "Am" },
    "Em": { mode: "minor", chords: ["Em", "F#dim", "G", "Am", "B", "C", "D"], abcKey: "Em" },
    "Dm": { mode: "minor", chords: ["Dm", "Edim", "F", "Gm", "A", "Bb", "C"], abcKey: "Dm" },
  };

  // Common chord progressions as indices (0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi, 6=vii)
  const PROGRESSIONS_MAJOR = [
    [0, 3, 4, 0],   // I-IV-V-I
    [0, 5, 3, 4],   // I-vi-IV-V
    [0, 4, 5, 3],   // I-V-vi-IV
    [0, 3, 5, 4],   // I-IV-vi-V
    [0, 1, 4, 0],   // I-ii-V-I
    [0, 5, 1, 4],   // I-vi-ii-V
    [0, 3, 0, 4],   // I-IV-I-V
    [5, 3, 0, 4],   // vi-IV-I-V
    [0, 4, 3, 0],   // I-V-IV-I
    [0, 2, 5, 3],   // I-iii-vi-IV
  ];

  const PROGRESSIONS_MINOR = [
    [0, 3, 4, 0],   // i-iv-V-i
    [0, 5, 2, 6],   // i-VI-III-VII
    [0, 3, 6, 2],   // i-iv-VII-III
    [0, 6, 5, 4],   // i-VII-VI-V
    [0, 2, 6, 0],   // i-III-VII-i
    [0, 3, 5, 4],   // i-iv-VI-V
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
  // 2. DIFFICULTY & RHYTHM POOLS
  // ==========================================================

  const DIFFICULTY = {
    easy: {
      rhythms34: ["2", "1", "1 1"],
      rhythms44: ["2", "1", "1 1", "1 1 1"],
      restChance: 0.05,
      twoChordsChance: 0,
    },
    medium: {
      rhythms34: ["2", "1", "1 1", "3", "1/2 1/2 1", "1 1/2 1/2"],
      rhythms44: ["2", "1", "1 1", "1 1 1", "4", "1/2 1/2 1 1", "2 1 1"],
      restChance: 0.08,
      twoChordsChance: 0.3,
    },
    hard: {
      rhythms34: ["2", "1", "1 1", "3", "1/2 1/2 1", "1 1/2 1/2", "1/2 1/2 1/2 1/2 1/2 1/2"],
      rhythms44: ["2", "1", "1 1", "1 1 1", "4", "1/2 1/2 1 1", "2 1 1", "1/2 1/2 1/2 1/2 1 1", "3 1"],
      restChance: 0.10,
      twoChordsChance: 0.6,
    }
  };

  // ==========================================================
  // 3. RHYTHM GENERATION
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
  // 4. CHORD PROGRESSION GENERATION
  // ==========================================================

  function generateChordProgression(keyName, numMeasures, difficulty) {
    const keyData = KEY_CHORDS[keyName];
    const progs = keyData.mode === "major" ? PROGRESSIONS_MAJOR : PROGRESSIONS_MINOR;
    const profile = DIFFICULTY[difficulty];

    // Pick a chord progression pattern
    const prog = progs[Math.floor(seededRandom() * progs.length)];

    const chords = [];
    for (let m = 0; m < numMeasures; m++) {
      if (m === numMeasures - 1) {
        // Last measure: resolve to tonic
        chords.push([keyData.chords[0]]);
      } else {
        const chordIdx = prog[m % prog.length];

        if (seededRandom() < profile.twoChordsChance) {
          // Two chords per measure
          const nextChordIdx = prog[(m + 1) % prog.length];
          chords.push([keyData.chords[chordIdx], keyData.chords[nextChordIdx]]);
        } else {
          chords.push([keyData.chords[chordIdx]]);
        }
      }
    }

    return chords;
  }

  // ==========================================================
  // 5. LEAD SHEET GENERATION
  // ==========================================================

  function generateLeadSheet(keyName, meter, difficulty, numMeasures) {
    const beatsPerMeasure = meter === "3/4" ? 3 : 4;
    const profile = DIFFICULTY[difficulty];
    const chordProg = generateChordProgression(keyName, numMeasures, difficulty);

    const measures = [];

    for (let m = 0; m < numMeasures; m++) {
      const isLast = m === numMeasures - 1;
      const measureChords = chordProg[m];
      const hasTwoChords = measureChords.length > 1;

      let rhythm;
      if (isLast) {
        // Last measure: whole note (or dotted half in 3/4)
        rhythm = [beatsPerMeasure];
      } else if (hasTwoChords) {
        // Two chords: generate rhythm for each half independently
        const halfBeats = beatsPerMeasure / 2;
        const firstHalf = generateMeasureRhythm(halfBeats, difficulty);
        const secondHalf = generateMeasureRhythm(halfBeats, difficulty);
        rhythm = [...firstHalf, ...secondHalf];
      } else {
        rhythm = generateMeasureRhythm(beatsPerMeasure, difficulty);
      }

      // Build notes with rest chance
      const notes = [];
      let beatPos = 0;
      for (let n = 0; n < rhythm.length; n++) {
        const dur = rhythm[n];
        if (!isLast && seededRandom() < profile.restChance && beatPos > 0) {
          notes.push({ duration: dur, isRest: true });
        } else {
          notes.push({ duration: dur, isRest: false });
        }
        beatPos += dur;
      }

      // Determine chord positions
      const chordPositions = [0];
      if (hasTwoChords) {
        chordPositions.push(beatsPerMeasure / 2);
      }

      measures.push({
        chords: measureChords,
        chordPositions: chordPositions,
        notes: notes,
      });
    }

    return measures;
  }

  // ==========================================================
  // 6. ABC CONVERSION & RENDERING
  // ==========================================================

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

  function measuresToAbc(measures, keyName, meter) {
    const keyData = KEY_CHORDS[keyName];
    let abc = "X:1\nM:" + meter + "\nL:1/8\n%%stretchlast true\n";
    abc += "V:1 style=rhythm\n";
    abc += "K:" + keyData.abcKey + "\n";

    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i];
      let beatPos = 0;

      for (let j = 0; j < measure.notes.length; j++) {
        const note = measure.notes[j];

        // Check if a chord change happens at this beat position
        let chordStr = "";
        for (let c = 0; c < measure.chords.length; c++) {
          if (Math.abs(beatPos - measure.chordPositions[c]) < 0.01) {
            chordStr = '"' + measure.chords[c] + '"';
          }
        }

        if (note.isRest) {
          abc += chordStr + "z" + durationToAbc(note.duration);
        } else {
          abc += chordStr + "B" + durationToAbc(note.duration);
        }

        // Beaming: don't put space between consecutive eighth notes on the same beat
        const nextNote = measure.notes[j + 1];
        const isEighth = note.duration === 0.5;
        const nextIsEighth = nextNote && nextNote.duration === 0.5;
        const curBeat = Math.floor(beatPos);
        const nextBeatPos = beatPos + note.duration;
        const sameBeat = curBeat === Math.floor(nextBeatPos);
        if (!(isEighth && nextIsEighth && sameBeat)) abc += " ";

        beatPos = nextBeatPos;
      }

      abc += (i === measures.length - 1) ? "|]" : "| ";
    }
    return abc;
  }

  // Build a flat list of expected rhythm events with timing info
  function buildExpectedNotes(measures, bpm, meter) {
    const beatsPerMeasure = meter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / bpm;
    const notes = [];
    let time = 0;

    for (const measure of measures) {
      for (const note of measure.notes) {
        notes.push({
          isRest: note.isRest,
          startTime: time,
          duration: note.duration * secPerBeat,
          quarterBeats: note.duration,
        });
        time += note.duration * secPerBeat;
      }
    }
    return notes;
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
      jazzchords: true,
    });
    lastRenderedTune = tuneArr && tuneArr[0];
  }

  // ==========================================================
  // 7. AUDIO RECORDING & RMS SAMPLING
  // ==========================================================

  let audioCtx = null;
  let analyserNode = null;
  let micStream = null;
  let stereoRecordStream = null;
  let rmsSamples = [];       // { time, rms }
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
    source.connect(merger, 0, 0);
    source.connect(merger, 0, 1);
    merger.connect(stereoDest);
    stereoRecordStream = stereoDest.stream;
  }

  function startRmsSampling() {
    rmsSamples = [];
    recordingStartTime = performance.now();
    isRecording = true;
    sampleRms();
  }

  function sampleRms() {
    if (!isRecording) return;

    const buffer = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(buffer);

    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);

    const time = (performance.now() - recordingStartTime) / 1000;
    rmsSamples.push({ time, rms });

    samplingRAF = requestAnimationFrame(sampleRms);
  }

  function stopRmsSampling() {
    isRecording = false;
    if (samplingRAF) cancelAnimationFrame(samplingRAF);
  }

  // ==========================================================
  // 8. METRONOME
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
  // 9. ONSET DETECTION & RHYTHM SCORING
  // ==========================================================

  /**
   * Detect note onsets from RMS amplitude samples.
   * Returns an array of timestamps where the player started making sound.
   */
  function detectOnsets(samples) {
    const threshold = 0.015;
    const minGap = 0.1; // seconds between onsets
    const onsets = [];
    let wasSilent = true;
    let lastOnsetTime = -Infinity;

    for (const sample of samples) {
      if (sample.rms > threshold && wasSilent && (sample.time - lastOnsetTime) > minGap) {
        onsets.push(sample.time);
        lastOnsetTime = sample.time;
        wasSilent = false;
      } else if (sample.rms < threshold * 0.5) {
        wasSilent = true;
      }
    }
    return onsets;
  }

  /**
   * Score rhythm accuracy by comparing detected onsets with expected beat positions.
   */
  function scoreRhythm(expected, onsets, recordingDuration) {
    const results = expected.map(e => ({
      expected: e,
      matched: false,
      detectedNote: null,
      pitchCorrect: false,
      evaluated: false,
    }));

    const usedOnsets = new Set();

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];

      // Skip events that start after the recording ended
      if (recordingDuration != null && exp.startTime >= recordingDuration) {
        continue;
      }
      results[i].evaluated = true;

      if (exp.isRest) {
        // Rest: check no onset during rest period
        const restStart = exp.startTime;
        const restEnd = exp.startTime + exp.duration;
        let soundDuringRest = false;

        for (let o = 0; o < onsets.length; o++) {
          if (usedOnsets.has(o)) continue;
          if (onsets[o] >= restStart && onsets[o] < restEnd) {
            soundDuringRest = true;
            break;
          }
        }

        results[i].matched = true;
        results[i].pitchCorrect = !soundDuringRest;
        continue;
      }

      // Pitched note: find onset near expected start time
      const tolerance = Math.max(exp.duration * 0.5, 0.3);
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let o = 0; o < onsets.length; o++) {
        if (usedOnsets.has(o)) continue;
        const dist = Math.abs(onsets[o] - exp.startTime);
        if (dist < tolerance && dist < bestDist) {
          bestDist = dist;
          bestIdx = o;
        }
      }

      if (bestIdx >= 0) {
        usedOnsets.add(bestIdx);
        results[i].matched = true;
        results[i].pitchCorrect = true;
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
  // 10. VISUAL FEEDBACK — COLOR NOTES ON STAFF
  // ==========================================================

  function colorNoteElements(scoreResults) {
    const svgContainer = document.getElementById("notation");
    if (!svgContainer) return;

    const allEls = svgContainer.querySelectorAll(".abcjs-note, .abcjs-rest");
    let idx = 0;

    for (const el of allEls) {
      if (idx >= scoreResults.results.length) break;
      const result = scoreResults.results[idx];

      let color;
      if (!result.evaluated) {
        color = "#999";
      } else if (result.pitchCorrect) {
        color = "#2eaa2e"; // green — correct
      } else if (result.matched) {
        color = "#e8a317"; // orange — timing off
      } else {
        color = "#d43232"; // red — missed
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
  // 11. SCORE DISPLAY
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
          scoreResult.correctNotes + ' of ' + scoreResult.totalNotes + ' beats correct' +
        '</div>' +
      '</div>';
    el.style.display = "block";
  }

  function hideScore() {
    const el = document.getElementById("scoreDisplay");
    el.innerHTML = "";
    el.style.display = "none";
    document.getElementById("shareBtn").disabled = true;
    document.getElementById("shareRecordingBtn").disabled = true;
  }

  // ==========================================================
  // 12. SHARE — capture notation + score as image
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
    const headerH = 50;
    const canvasW = Math.max(svgW, 500);
    const canvasH = headerH + svgH + scoreCardH + padding * 3;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

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
    const headerText = "Lead Sheet — " + keyLabel + "  |  " + meter + "  |  " + bpm + " BPM  |  " + diffLabel;
    ctx.fillStyle = "#333";
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(headerText, canvasW / 2, padding + 16);

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

  async function shareScore() {
    setStatus("Preparing image...");
    const blob = await captureResultImage();
    if (!blob) { setStatus("Nothing to share."); return; }

    const file = new File([blob], "leadsheet-score.png", { type: "image/png" });

    let keyLabel, meter;
    if (activeAttemptIdx >= 0 && attempts[activeAttemptIdx] && attempts[activeAttemptIdx].settings) {
      keyLabel = attempts[activeAttemptIdx].settings.keyLabel;
      meter = attempts[activeAttemptIdx].settings.meter;
    } else {
      keyLabel = document.getElementById("keySelect").selectedOptions[0].text;
      meter = document.getElementById("meterSelect").value;
    }
    const shareTitle = "Lead Sheet Score — " + keyLabel + " " + meter;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, files: [file] });
        setStatus("");
      } catch (err) {
        if (err.name !== "AbortError") fallbackDownload(blob);
        setStatus("");
      }
    } else {
      fallbackDownload(blob);
      setStatus("");
    }
  }

  function fallbackDownload(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leadsheet-score.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================================
  // 12b. SHARE RECORDING
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

    const audioFile = new File([audioBlob], "leadsheet-recording." + ext, { type: mimeType });
    const files = [audioFile];
    if (imgBlob) {
      files.push(new File([imgBlob], "leadsheet-score.png", { type: "image/png" }));
    }

    let keyLabel = "";
    let meter = "";
    if (attempt.settings) {
      keyLabel = attempt.settings.keyLabel;
      meter = attempt.settings.meter;
    }
    const shareTitle = "Lead Sheet Recording — " + keyLabel + " " + meter;

    if (navigator.canShare && navigator.canShare({ files: files })) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, files: files });
        setStatus("");
      } catch (err) {
        if (err.name !== "AbortError") fallbackDownloadAudio(audioBlob, ext);
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
    a.download = "leadsheet-recording." + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================================
  // 13. STATUS / COUNTDOWN DISPLAY
  // ==========================================================

  function setStatus(msg) {
    document.getElementById("statusDisplay").textContent = msg;
  }

  function clearStatus() {
    document.getElementById("statusDisplay").textContent = "";
  }

  // ==========================================================
  // 14. MAIN CONTROLLER
  // ==========================================================

  let currentMeasures = null;
  let currentExpectedNotes = null;
  let currentKeyName = null;
  let currentMeter = null;
  let currentBpm = 80;
  let currentNumMeasures = 8;

  const MAX_ATTEMPTS = 4;
  let attempts = [];
  let activeAttemptIdx = -1;

  function generate() {
    const seedStr = String(Math.random()).slice(2);
    seedPRNG(seedStr);
    lastUsedSeed = seedStr;

    currentKeyName   = document.getElementById("keySelect").value;
    currentMeter     = document.getElementById("meterSelect").value;
    const difficulty = document.getElementById("difficultySelect").value;
    currentNumMeasures = parseInt(document.getElementById("measuresSelect").value, 10);
    currentBpm       = parseInt(document.getElementById("bpmSelect").value, 10);

    currentMeasures = generateLeadSheet(currentKeyName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);

    const abc = measuresToAbc(currentMeasures, currentKeyName, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();
    document.getElementById("dailyBanner").style.display = "none";

    document.getElementById("recordBtn").disabled = false;
    document.getElementById("playBtn").disabled = false;
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
    const recordBtn = document.getElementById("recordBtn");
    const generateBtn = document.getElementById("generateBtn");
    const playBtn = document.getElementById("playBtn");
    recordBtn.textContent = "\u25A0 Stop";
    generateBtn.disabled = true;
    playBtn.disabled = true;
    stopPlayback();
    hideScore();

    // Re-render clean
    const abc = measuresToAbc(currentMeasures, currentKeyName, currentMeter);
    render(abc);

    const countInBars = 1;
    recordMetronomeGain = audioCtx.createGain();
    recordMetronomeGain.connect(audioCtx.destination);
    const schedule = scheduleMetronome(audioCtx, currentBpm, currentMeter, currentNumMeasures, countInBars, recordMetronomeGain);

    const beatsPerMeasure = currentMeter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / currentBpm;
    const countInBeats = countInBars * beatsPerMeasure;

    let countUpBeat = 1;
    setStatus("Count in: " + countUpBeat);

    recordingInterval = setInterval(() => {
      countUpBeat++;
      if (countUpBeat <= countInBeats) {
        setStatus("Count in: " + countUpBeat);
      } else {
        setStatus("\uD83C\uDFB5 Recording...");
        clearInterval(recordingInterval);
        recordingInterval = null;
      }
    }, secPerBeat * 1000);

    const countInMs = countInBars * beatsPerMeasure * secPerBeat * 1000;
    recordingTimeouts.push(setTimeout(() => {
      startRmsSampling();

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

      // Schedule note highlighting during recording
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

    const melodyDurationMs = currentNumMeasures * beatsPerMeasure * secPerBeat * 1000;
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

    stopRmsSampling();

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

    const recordBtn = document.getElementById("recordBtn");
    const generateBtn = document.getElementById("generateBtn");
    const playBtn = document.getElementById("playBtn");

    // Detect onsets from RMS samples
    const onsets = detectOnsets(rmsSamples);
    const recordingDuration = rmsSamples.length > 0
      ? rmsSamples[rmsSamples.length - 1].time
      : 0;
    const scoreResult = scoreRhythm(currentExpectedNotes, onsets, recordingDuration);
    scoreResult.stoppedEarly = !!stoppedEarly;

    const attemptSettings = {
      keyLabel: document.getElementById("keySelect").selectedOptions[0].text,
      meter: currentMeter,
      bpm: currentBpm,
      difficulty: document.getElementById("difficultySelect").value,
      seed: lastUsedSeed,
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

    recordBtn.textContent = "Record & Score";
    generateBtn.disabled = false;
    playBtn.disabled = false;
    document.getElementById("shareBtn").disabled = false;

    if (attempts.length >= MAX_ATTEMPTS) {
      recordBtn.disabled = true;
      setStatus("Max attempts reached. Generate a new lead sheet to continue.");
    } else {
      recordBtn.disabled = false;
    }
  }

  // ==========================================================
  // 15. PLAYBACK
  // ==========================================================

  let playbackCtx = null;
  let playbackTimeouts = [];
  let isPlaying = false;
  let highlightedEl = null;
  let metronomeGainNode = null;
  let metronomeMuted = false;
  const HIGHLIGHT_COLOR = "#3a6ea5";

  /** Play a short percussive "strum" sound */
  function playStrum(ctx, startTime, duration) {
    // Filtered noise burst for a guitar-like strum
    const bufferSize = Math.floor(ctx.sampleRate * 0.06);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(startTime + 0.07);
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

    document.getElementById("generateBtn").disabled = true;
    document.getElementById("recordBtn").disabled = true;

    const beatsPerMeasure = currentMeter === "3/4" ? 3 : 4;
    const secPerBeat = 60 / currentBpm;

    const countInBars = 1;
    const countInBeats = countInBars * beatsPerMeasure;
    const countInDuration = countInBeats * secPerBeat;

    const baseTime = playbackCtx.currentTime + 0.1;

    metronomeGainNode = playbackCtx.createGain();
    metronomeGainNode.gain.value = metronomeMuted ? 0 : 1;
    metronomeGainNode.connect(playbackCtx.destination);

    for (let beat = 0; beat < countInBeats; beat++) {
      const time = baseTime + beat * secPerBeat;
      const isAccent = beat === 0;
      playClick(playbackCtx, time, isAccent, metronomeGainNode);
    }

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
    playbackTimeouts.push(countInInterval);

    const melodyBaseTime = baseTime + countInDuration;
    const countInMs = countInDuration * 1000;

    const totalBeats = currentNumMeasures * beatsPerMeasure;
    for (let beat = 0; beat < totalBeats; beat++) {
      const time = melodyBaseTime + beat * secPerBeat;
      const isAccent = (beat % beatsPerMeasure) === 0;
      playClick(playbackCtx, time, isAccent, metronomeGainNode);
    }

    const allEls = getAllNoteRestEls();

    for (let i = 0; i < currentExpectedNotes.length; i++) {
      const note = currentExpectedNotes[i];
      const noteStart = melodyBaseTime + note.startTime;

      // Play a strum sound for each non-rest note
      if (!note.isRest) {
        playStrum(playbackCtx, noteStart, note.duration * 0.9);
      }

      // Schedule visual highlight
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

    if (playbackCtx) {
      playbackCtx.close().catch(() => {});
      playbackCtx = null;
    }

    const playBtn = document.getElementById("playBtn");
    playBtn.textContent = "\u25B6 Play";

    if (currentMeasures) {
      document.getElementById("generateBtn").disabled = false;
      document.getElementById("recordBtn").disabled = attempts.length >= MAX_ATTEMPTS;
    }
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  // ==========================================================
  // 16. ATTEMPT MANAGEMENT
  // ==========================================================

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

    const abc = measuresToAbc(currentMeasures, currentKeyName, currentMeter);
    render(abc);
    colorNoteElements(attempts[idx].scoreResult);
    showScore(attempts[idx].scoreResult);
    renderAttemptButtons();
    document.getElementById("shareBtn").disabled = false;
    const hasAudio = attempts[idx] && attempts[idx].settings.audioBlob;
    document.getElementById("shareRecordingBtn").disabled = !hasAudio;
  }

  // ==========================================================
  // 17. SCORE HISTORY (localStorage)
  // ==========================================================

  const SCORE_HISTORY_KEY = "leadsheet-score-history";

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

    const keys = Object.keys(KEY_CHORDS);
    const diffs = ["easy", "medium", "hard"];
    const meters = ["4/4", "3/4"];
    const bpmOpts = [50, 60, 70, 80];

    const keyName = keys[Math.floor(seededRandom() * keys.length)];
    const difficulty = diffs[Math.floor(seededRandom() * diffs.length)];
    const meter = meters[Math.floor(seededRandom() * meters.length)];
    const numMeasures = 4;
    const bpm = bpmOpts[Math.floor(seededRandom() * bpmOpts.length)];

    document.getElementById("keySelect").value = keyName;
    document.getElementById("meterSelect").value = meter;
    document.getElementById("difficultySelect").value = difficulty;
    document.getElementById("measuresSelect").value = String(numMeasures);
    document.getElementById("bpmSelect").value = String(bpm);

    currentKeyName = keyName;
    currentMeter = meter;
    currentNumMeasures = numMeasures;
    currentBpm = bpm;

    seedPRNG(dateStr + "-leadsheet");

    currentMeasures = generateLeadSheet(keyName, currentMeter, difficulty, currentNumMeasures);
    currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);

    const abc = measuresToAbc(currentMeasures, currentKeyName, currentMeter);
    render(abc);
    hideScore();
    clearStatus();
    clearAttempts();
    stopPlayback();

    document.getElementById("recordBtn").disabled = false;
    document.getElementById("playBtn").disabled = false;
    document.getElementById("dailyBanner").textContent = "\uD83C\uDF1F Daily Challenge \u2014 " + dateStr;
    document.getElementById("dailyBanner").style.display = "block";
  }

  // ==========================================================
  // WIRE UP
  // ==========================================================

  document.getElementById("generateBtn").addEventListener("click", generate);
  document.getElementById("dailyChallengeBtn").addEventListener("click", dailyChallenge);
  document.getElementById("playBtn").addEventListener("click", togglePlayback);
  document.getElementById("recordBtn").addEventListener("click", startRecording);
  document.getElementById("shareBtn").addEventListener("click", shareScore);
  document.getElementById("shareRecordingBtn").addEventListener("click", shareRecording);
  document.getElementById("historyBtn").addEventListener("click", showHistory);
  document.getElementById("historyCloseBtn").addEventListener("click", hideHistory);
  document.getElementById("historyModal").addEventListener("click", function (e) {
    if (e.target === this) hideHistory();
  });
  document.getElementById("metronomeMuteBtn").addEventListener("click", function () {
    metronomeMuted = !metronomeMuted;
    this.classList.toggle("muted", metronomeMuted);
    this.innerHTML = metronomeMuted ? "\uD83D\uDD07 Metronome" : "\uD83D\uDD0A Metronome";
    if (metronomeGainNode) {
      metronomeGainNode.gain.value = metronomeMuted ? 0 : 1;
    }
  });
  document.getElementById("bpmSelect").addEventListener("change", function () {
    currentBpm = parseInt(this.value, 10);
    if (currentMeasures && currentMeter) {
      currentExpectedNotes = buildExpectedNotes(currentMeasures, currentBpm, currentMeter);
    }
  });

  // Generate on load
  generate();
})();
