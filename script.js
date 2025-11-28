const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const tunerUI = document.getElementById('tuner-ui');
const noteDisplay = document.getElementById('string-name');
const notePrevDisplay = document.getElementById('note-prev');
const noteNextDisplay = document.getElementById('note-next');
const frequencyDisplay = document.getElementById('frequency');
const needle = document.getElementById('needle');
const statusDisplay = document.getElementById('status');

let audioContext = null;
let analyser = null;
let mediaStreamSource = null;
let isRunning = false;

// Chromatic Notes
const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

startBtn.addEventListener('click', startTuner);

async function startTuner() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 4096; // Higher resolution

        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        mediaStreamSource.connect(filter);
        filter.connect(analyser);

        startScreen.classList.add('hidden');
        tunerUI.classList.remove('hidden');
        isRunning = true;
        updatePitch();
    } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Erro: Não foi possível acessar o microfone. Verifique as permissões.');
    }
}

const buflen = 4096;
const buf = new Float32Array(buflen);

const pitchBuffer = [];
const bufferSize = 15; // Moderate smoothing for pitch

function updatePitch() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    const ac = autoCorrelate(buf, audioContext.sampleRate);

    if (ac === -1) {
        statusDisplay.innerText = "Toque uma corda";
        needle.style.transform = "translateX(-50%) rotate(0deg)";
        needle.classList.remove('correct');
        noteDisplay.classList.remove('correct');
        pitchBuffer.length = 0;
        notePrevDisplay.innerText = "--";
        noteNextDisplay.innerText = "--";
    } else {
        const rawPitch = ac;

        // Smooth the PITCH (Frequency) not the cents
        pitchBuffer.push(rawPitch);
        if (pitchBuffer.length > bufferSize) pitchBuffer.shift();
        const smoothedPitch = pitchBuffer.reduce((a, b) => a + b, 0) / pitchBuffer.length;

        frequencyDisplay.innerText = Math.round(smoothedPitch) + " Hz";

        // Calculate note and cents from the SMOOTHED pitch
        const noteInfo = getNote(smoothedPitch);

        noteDisplay.innerText = noteInfo.name;
        notePrevDisplay.innerText = noteInfo.prev;
        noteNextDisplay.innerText = noteInfo.next;

        updateNeedle(noteInfo.cents);

        // Tolerance +/- 10 cents
        if (Math.abs(noteInfo.cents) < 10) {
            statusDisplay.innerText = "Perfeito!";
            noteDisplay.classList.add('correct');
            needle.classList.add('correct');
        } else if (noteInfo.cents < 0) {
            statusDisplay.innerText = "Muito Baixo (Aperte)";
            noteDisplay.classList.remove('correct');
            needle.classList.remove('correct');
        } else {
            statusDisplay.innerText = "Muito Alto (Solte)";
            noteDisplay.classList.remove('correct');
            needle.classList.remove('correct');
        }
    }

    requestAnimationFrame(updatePitch);
}

function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);

    if (rms < 0.01) return -1;

    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++)
        if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }

    buf = buf.slice(r1, r2);
    size = buf.length;

    const c = new Array(size).fill(0);
    for (let i = 0; i < size; i++)
        for (let j = 0; j < size - i; j++)
            c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function getNote(freq) {
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;

    const noteIndex = midi % 12;
    const name = noteStrings[noteIndex];

    const prevIndex = (noteIndex - 1 + 12) % 12;
    const nextIndex = (noteIndex + 1) % 12;

    const targetFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(freq / targetFreq);

    return {
        name: name,
        prev: noteStrings[prevIndex],
        next: noteStrings[nextIndex],
        cents: cents,
        freq: targetFreq
    };
}

function updateNeedle(cents) {
    // Clamp cents to -50 to 50 for display
    let displayCents = Math.max(-50, Math.min(50, cents));
    // Map -50..50 to -90..90 degrees
    let angle = displayCents * (90 / 50);
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}
