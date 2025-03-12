/**
 * Web-Based Voice Recorder - Main JavaScript
 * This file contains the core functionality for the voice recording application.
 */

// Global variables
let mediaRecorder;
let audioChunks = [];
let audioStream;
let audioContext;
let analyser;
let recordingStartTime;
let recordingTimer;
let isRecording = false;
let isPaused = false;
let currentVisualization = 'waveform';

// DOM Elements
const recordButton = document.getElementById('record-button');
const stopButton = document.getElementById('stop-button');
const pauseButton = document.getElementById('pause-button');
const statusText = document.getElementById('status-text');
const recordingTime = document.getElementById('recording-time');
const visualizer = document.getElementById('visualizer');
const visualizationTypeSelect = document.getElementById('visualization-type');
const recordingsContainer = document.getElementById('recordings-container');
const noRecordingsMessage = document.getElementById('no-recordings');

// Canvas context
const canvasContext = visualizer.getContext('2d');

// Initialize the application
function init() {
    // Set up event listeners
    recordButton.addEventListener('click', toggleRecording);
    stopButton.addEventListener('click', stopRecording);
    pauseButton.addEventListener('click', togglePause);
    visualizationTypeSelect.addEventListener('change', changeVisualizationType);

    // Set up canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load saved recordings
    loadRecordings();
}

// Resize canvas to fit container
function resizeCanvas() {
    visualizer.width = visualizer.clientWidth;
    visualizer.height = visualizer.clientHeight;
}

// Request microphone access and start recording
async function toggleRecording() {
    if (isRecording) {
        if (isPaused) {
            resumeRecording();
        } else {
            pauseRecording();
        }
        return;
    }

    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupAudioContext();
        setupMediaRecorder();

        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        updateRecordingTime();
        recordingTimer = setInterval(updateRecordingTime, 1000);

        // Update UI
        recordButton.textContent = 'Pause';
        stopButton.disabled = false;
        pauseButton.disabled = false;
        statusText.textContent = 'Recording...';

        // Start visualization
        visualize();
    } catch (error) {
        console.error('Error accessing microphone:', error);
        statusText.textContent = 'Error: Could not access microphone';
    }
}

// Set up audio context and analyser
function setupAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);
    analyser.fftSize = 2048;
}

// Set up media recorder
function setupMediaRecorder() {
    mediaRecorder = new MediaRecorder(audioStream);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = saveRecording;
}

// Pause recording
function pauseRecording() {
    if (!isRecording || isPaused) return;

    mediaRecorder.pause();
    isPaused = true;
    clearInterval(recordingTimer);

    // Update UI
    recordButton.textContent = 'Resume';
    statusText.textContent = 'Paused';
}

// Resume recording
function resumeRecording() {
    if (!isRecording || !isPaused) return;

    mediaRecorder.resume();
    isPaused = false;
    recordingTimer = setInterval(updateRecordingTime, 1000);

    // Update UI
    recordButton.textContent = 'Pause';
    statusText.textContent = 'Recording...';
}

// Toggle pause/resume
function togglePause() {
    if (isPaused) {
        resumeRecording();
    } else {
        pauseRecording();
    }
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;

    mediaRecorder.stop();
    isRecording = false;
    isPaused = false;
    clearInterval(recordingTimer);

    // Stop all tracks on the stream
    audioStream.getTracks().forEach(track => track.stop());

    // Update UI
    recordButton.textContent = 'Record';
    stopButton.disabled = true;
    pauseButton.disabled = true;
    statusText.textContent = 'Processing recording...';
}

// Update recording time display
function updateRecordingTime() {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed / 1000 / 60) % 60).toString().padStart(2, '0');
    recordingTime.textContent = `${minutes}:${seconds}`;
}

// Save recording to local storage
function saveRecording() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(audioBlob);

    // Create recording object
    const recording = {
        id: Date.now().toString(),
        url: audioUrl,
        blob: audioBlob,
        timestamp: new Date().toISOString(),
        duration: recordingTime.textContent
    };

    // Save to local storage (just the metadata, not the blob)
    const recordings = JSON.parse(localStorage.getItem('recordings') || '[]');
    recordings.push({
        id: recording.id,
        timestamp: recording.timestamp,
        duration: recording.duration
    });
    localStorage.setItem('recordings', JSON.stringify(recordings));

    // Store the blob in IndexedDB
    storeRecordingBlob(recording.id, audioBlob);

    // Add to UI
    addRecordingToList(recording);

    // Reset for next recording
    audioChunks = [];
    statusText.textContent = 'Recording saved';

    // Hide "no recordings" message if it's visible
    if (noRecordingsMessage) {
        noRecordingsMessage.style.display = 'none';
    }
}

// Store recording blob in IndexedDB
function storeRecordingBlob(id, blob) {
    // This is a simplified version - in a real app, you'd want to check for
    // IndexedDB support and implement proper error handling
    const request = indexedDB.open('VoiceRecorderDB', 1);

    request.onupgradeneeded = function(event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('recordings')) {
            db.createObjectStore('recordings', { keyPath: 'id' });
        }
    };

    request.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const store = transaction.objectStore('recordings');
        store.put({ id: id, blob: blob });
    };

    request.onerror = function(event) {
        console.error('IndexedDB error:', event.target.error);
        // Fall back to localStorage if IndexedDB fails
        // Note: This is not ideal for large blobs but serves as a fallback
        try {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = function() {
                const recordings = JSON.parse(localStorage.getItem('recordings') || '[]');
                const recordingIndex = recordings.findIndex(r => r.id === id);
                if (recordingIndex !== -1) {
                    recordings[recordingIndex].data = reader.result;
                    localStorage.setItem('recordings', JSON.stringify(recordings));
                }
            };
        } catch (e) {
            console.error('Failed to store recording:', e);
        }
    };
}

// Add recording to the UI list
function addRecordingToList(recording) {
    const recordingElement = document.createElement('div');
    recordingElement.className = 'recording-item';
    recordingElement.dataset.id = recording.id;

    const recordingDate = new Date(recording.timestamp).toLocaleString();

    recordingElement.innerHTML = `
        <div class="recording-info">
            <span class="recording-date">${recordingDate}</span>
            <span class="recording-duration">${recording.duration}</span>
        </div>
        <div class="recording-controls">
            <button class="btn play-btn">Play</button>
            <button class="btn delete-btn">Delete</button>
        </div>
        <audio src="${recording.url}" controls style="display: none;"></audio>
    `;

    // Add event listeners
    const playButton = recordingElement.querySelector('.play-btn');
    const deleteButton = recordingElement.querySelector('.delete-btn');
    const audio = recordingElement.querySelector('audio');

    playButton.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playButton.textContent = 'Pause';
        } else {
            audio.pause();
            playButton.textContent = 'Play';
        }
    });

    deleteButton.addEventListener('click', () => {
        deleteRecording(recording.id);
        recordingElement.remove();

        // Show "no recordings" message if there are no recordings left
        const recordings = document.querySelectorAll('.recording-item');
        if (recordings.length === 0 && noRecordingsMessage) {
            noRecordingsMessage.style.display = 'block';
        }
    });

    // Add to container
    recordingsContainer.appendChild(recordingElement);
}

// Delete recording from storage
function deleteRecording(id) {
    // Remove from localStorage
    const recordings = JSON.parse(localStorage.getItem('recordings') || '[]');
    const updatedRecordings = recordings.filter(recording => recording.id !== id);
    localStorage.setItem('recordings', JSON.stringify(updatedRecordings));

    // Remove from IndexedDB
    const request = indexedDB.open('VoiceRecorderDB', 1);
    request.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const store = transaction.objectStore('recordings');
        store.delete(id);
    };
}

// Load recordings from storage
function loadRecordings() {
    const recordings = JSON.parse(localStorage.getItem('recordings') || '[]');

    if (recordings.length === 0) {
        return; // No recordings to load
    }

    // Hide "no recordings" message
    if (noRecordingsMessage) {
        noRecordingsMessage.style.display = 'none';
    }

    // Open IndexedDB
    const request = indexedDB.open('VoiceRecorderDB', 1);

    request.onupgradeneeded = function(event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('recordings')) {
            db.createObjectStore('recordings', { keyPath: 'id' });
        }
    };

    request.onsuccess = function(event) {
        const db = event.target.result;

        recordings.forEach(recordingMeta => {
            const transaction = db.transaction(['recordings'], 'readonly');
            const store = transaction.objectStore('recordings');
            const getRequest = store.get(recordingMeta.id);

            getRequest.onsuccess = function(event) {
                const record = event.target.result;

                if (record && record.blob) {
                    const audioUrl = URL.createObjectURL(record.blob);

                    const recording = {
                        id: recordingMeta.id,
                        url: audioUrl,
                        blob: record.blob,
                        timestamp: recordingMeta.timestamp,
                        duration: recordingMeta.duration
                    };

                    addRecordingToList(recording);
                } else {
                    // Try to get from localStorage fallback
                    if (recordingMeta.data) {
                        const blob = dataURItoBlob(recordingMeta.data);
                        const audioUrl = URL.createObjectURL(blob);

                        const recording = {
                            id: recordingMeta.id,
                            url: audioUrl,
                            blob: blob,
                            timestamp: recordingMeta.timestamp,
                            duration: recordingMeta.duration
                        };

                        addRecordingToList(recording);
                    }
                }
            };
        });
    };

    request.onerror = function(event) {
        console.error('Error loading recordings from IndexedDB:', event.target.error);
        // Could implement a fallback here if needed
    };
}

// Convert data URI to Blob
function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type: mimeString });
}

// Change visualization type
function changeVisualizationType() {
    currentVisualization = visualizationTypeSelect.value;
}

// Visualize audio
function visualize() {
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!isRecording) return;

        requestAnimationFrame(draw);

        // Get audio data
        if (currentVisualization === 'waveform') {
            analyser.getByteTimeDomainData(dataArray);
            drawWaveform(dataArray, bufferLength);
        } else if (currentVisualization === 'frequency') {
            analyser.getByteFrequencyData(dataArray);
            drawFrequencyBars(dataArray, bufferLength);
        } else if (currentVisualization === 'circular') {
            analyser.getByteFrequencyData(dataArray);
            drawCircularVisualization(dataArray, bufferLength);
        }
    }

    draw();
}

// Draw waveform visualization
function drawWaveform(dataArray, bufferLength) {
    canvasContext.fillStyle = 'rgb(240, 240, 240)';
    canvasContext.fillRect(0, 0, visualizer.width, visualizer.height);

    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = 'rgb(74, 111, 165)';
    canvasContext.beginPath();

    const sliceWidth = visualizer.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * visualizer.height / 2;

        if (i === 0) {
            canvasContext.moveTo(x, y);
        } else {
            canvasContext.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasContext.lineTo(visualizer.width, visualizer.height / 2);
    canvasContext.stroke();
}

// Draw frequency bars visualization
function drawFrequencyBars(dataArray, bufferLength) {
    canvasContext.fillStyle = 'rgb(240, 240, 240)';
    canvasContext.fillRect(0, 0, visualizer.width, visualizer.height);

    const barWidth = (visualizer.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Use gradient based on frequency
        const hue = i / bufferLength * 360;
        canvasContext.fillStyle = `hsl(${hue}, 70%, 60%)`;

        canvasContext.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}

// Draw circular visualization
function drawCircularVisualization(dataArray, bufferLength) {
    canvasContext.fillStyle = 'rgb(240, 240, 240)';
    canvasContext.fillRect(0, 0, visualizer.width, visualizer.height);

    const centerX = visualizer.width / 2;
    const centerY = visualizer.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    canvasContext.beginPath();
    canvasContext.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    canvasContext.strokeStyle = 'rgb(200, 200, 200)';
    canvasContext.stroke();

    // Draw frequency data as lines from center
    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] / 255;
        const angle = (i / bufferLength) * 2 * Math.PI;

        const x = centerX + Math.cos(angle) * radius * value;
        const y = centerY + Math.sin(angle) * radius * value;

        canvasContext.beginPath();
        canvasContext.moveTo(centerX, centerY);
        canvasContext.lineTo(x, y);

        // Use gradient based on frequency
        const hue = i / bufferLength * 360;
        canvasContext.strokeStyle = `hsl(${hue}, 70%, 60%)`;
        canvasContext.stroke();
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
