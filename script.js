const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const tunerUI = document.getElementById('tuner-ui');
const noteDisplay = document.getElementById('string-name');
const frequencyDisplay = document.getElementById('frequency');
const needle = document.getElementById('needle');
const statusDisplay = document.getElementById('status');

let audioContext = null;
let analyser = null;
let mediaStreamSource = null;
let isRunning = false;

// Standard Guitar Tuning (E A D G B E)
const guitarStrings = [
    { note: 'E', freq: 82.41 },
    { note: 'A', freq: 110.00 },
    { note: 'D', freq: 146.83 },
    { note: 'G', freq: 196.00 },
    { note: 'B', freq: 246.94 },
    { note: 'e', freq: 329.63 }
];

startBtn.addEventListener('click', startTuner);

async function startTuner() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;

        // Optional: Low pass filter to help with fundamental frequency detection
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        mediaStreamSource.connect(filter);
        filter.connect(analyser);
        // Do not connect to destination (speakers) to avoid feedback loop!

        startScreen.classList.add('hidden');
        tunerUI.classList.remove('hidden');
        isRunning = true;
        updatePitch();
    } catch (err) {
        console.error('Erro ao acessar microfone:', err);
        alert('Erro: Não foi possível acessar o microfone. Verifique as permissões.');
    }
}

const buflen = 2048;
const buf = new Float32Array(buflen);

const centsBuffer = [];
const bufferSize = 8; // Smoothing factor

function updatePitch() {
    if (!isRunning) return;

    analyser.getFloatTimeDomainData(buf);
    const ac = autoCorrelate(buf, audioContext.sampleRate);

    if (ac === -1) {
        // No signal or too quiet
        statusDisplay.innerText = "Toque uma corda";
        needle.style.transform = "translateX(-50%) rotate(0deg)";
        needle.classList.remove('correct');
        noteDisplay.classList.remove('correct');
        // Clear buffer on silence
        centsBuffer.length = 0;
    } else {
        const pitch = ac;
        frequencyDisplay.innerText = Math.round(pitch) + " Hz";

        const closest = findClosestString(pitch);
        const cents = getCents(pitch, closest.freq);

        noteDisplay.innerText = closest.note;

        // Smoothing
        centsBuffer.push(cents);
        if (centsBuffer.length > bufferSize) centsBuffer.shift();
        const smoothedCents = centsBuffer.reduce((a, b) => a + b, 0) / centsBuffer.length;

        updateNeedle(smoothedCents);

        // Use smoothed cents for stability in status
        if (Math.abs(smoothedCents) < 5) {
            statusDisplay.innerText = "Perfeito!";
            noteDisplay.classList.add('correct');
            needle.classList.add('correct');
        } else if (smoothedCents < 0) {
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
    // RMS for signal threshold
    let size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);

    if (rms < 0.01) return -1; // Too quiet

    // Trim buffer to significant part
    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++)
        if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }

    buf = buf.slice(r1, r2);
    size = buf.length;

    // Autocorrelation
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

    // Parabolic interpolation for better precision
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function findClosestString(freq) {
    let minDiff = Infinity;
    let closest = guitarStrings[0];

    for (let str of guitarStrings) {
        let diff = Math.abs(freq - str.freq);
        if (diff < minDiff) {
            minDiff = diff;
            closest = str;
        }
    }
    return closest;
}

function getCents(freq, targetFreq) {
    return 1200 * Math.log2(freq / targetFreq);
}

function updateNeedle(cents) {
    // Clamp cents to -50 to 50 for display
    let displayCents = Math.max(-50, Math.min(50, cents));
    // Map -50..50 to -90..90 degrees
    let angle = displayCents * (90 / 50);
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}
