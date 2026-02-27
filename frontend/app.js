/**
 * HAILE — App Entry Point
 *
 * Wires modules together, handles boot sequence and event bindings.
 */

import { GREETING_TEXT } from './config.js';
import { state } from './state.js';
import {
    avatarPlaceholder,
    avatarVideo,
    chatInput,
    chatMessagesEl,
    btnSend,
    btnMic,
    setStatus,
    setSpeakingIndicator,
    setListeningBadge,
    startAssistantBubble,
} from './dom.js';
import {
    fetchSpeechToken,
    initAvatar,
    stopSpeaking,
    queueAvatarSentence,
    buildSsml,
} from './speech.js';
import { startListening, stopListening } from './stt.js';
import {
    initRealtimeMode,
    startRealtimeAudioStream,
    stopRealtimeAudioStream,
} from './realtime.js';
import { sendMessage } from './chat.js';
import { initAuthGate } from './auth.js';

// ── Wire cross-module callbacks ──

state.onSendMessage = sendMessage;
state.onStopListening = stopListening;
state.onSpeakComplete = () => {
    if (state.realtimeMode) {
        if (!state.realtimeAudioContext || state.realtimeAudioContext.state === 'closed') {
            startRealtimeAudioStream();
        }
        setListeningBadge(true);
    } else {
        if (!state.isListening) startListening();
    }
};

// ── Auth gate ──

initAuthGate();

// ── Input events ──

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (state.isListening) stopListening();
        sendMessage();
    }
});

btnSend.addEventListener('click', () => {
    if (state.isListening) stopListening();
    sendMessage();
});

btnMic.addEventListener('click', () => {
    if (state.realtimeMode) {
        if (state.realtimeAudioContext && state.realtimeAudioContext.state !== 'closed') {
            stopRealtimeAudioStream();
        } else {
            startRealtimeAudioStream();
        }
    } else {
        if (state.isListening) stopListening();
        else startListening();
    }
});

// ── Screen navigation ──

const screenSleep = document.getElementById('screen-sleep');
const screenMain = document.getElementById('screen-main');

function showScreen(screenId) {
    [screenSleep, screenMain].forEach((s) => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ── Greeting ──

async function triggerGreeting() {
    startAssistantBubble();
    state.audioAttachedForResponse = false;
    queueAvatarSentence(buildSsml(GREETING_TEXT), GREETING_TEXT);
    state.conversationMessages.push({ role: 'assistant', content: GREETING_TEXT });
    state.currentAssistantBubble = null;
}

// ── Back / Reset ──

document.getElementById('btn-back').addEventListener('click', resetAndGoBack);

async function resetAndGoBack() {
    stopSpeaking();

    stopRealtimeAudioStream();
    if (state.realtimeWs) {
        try {
            state.realtimeWs.close();
        } catch (e) {
            /* ignore */
        }
        state.realtimeWs = null;
    }
    state.realtimeMode = false;
    state.realtimeResponseActive = false;
    state.pendingRealtimeAssistantBubble = null;

    if (state.isListening) stopListening();
    if (state.sttRecognizer) {
        try {
            state.sttRecognizer.close();
        } catch (e) {
            /* ignore */
        }
        state.sttRecognizer = null;
    }

    if (state.avatarSynthesizer) {
        try {
            state.avatarSynthesizer.close();
        } catch (e) {
            /* ignore */
        }
        state.avatarSynthesizer = null;
    }
    state.avatarReady = false;
    if (state.peerConnection) {
        try {
            state.peerConnection.close();
        } catch (e) {
            /* ignore */
        }
        state.peerConnection = null;
    }

    chatMessagesEl.innerHTML = '';
    state.conversationMessages = [];
    state.currentAssistantBubble = null;
    state.currentAssistantText = '';
    state.pendingSpeechCount = 0;
    state.speechGeneration++;
    state.audioAttachedForResponse = false;
    state.deferredTextQueue = [];
    state.finalizedText = '';
    chatInput.value = '';

    avatarVideo.classList.add('hidden');
    avatarVideo.srcObject = null;
    avatarPlaceholder.style.display = '';
    const spinner = avatarPlaceholder.querySelector('.avatar-loading-spinner');
    if (!spinner) {
        const s = document.createElement('div');
        s.className = 'avatar-loading-spinner';
        avatarPlaceholder.insertBefore(s, avatarPlaceholder.firstChild);
    }
    setStatus('Connecting...');

    state.speechToken = null;
    state.avatarVideoStream = null;
    state.avatarVideoReady = null;
    state.avatarVideoReadyResolve = null;

    showScreen('screen-sleep');
}

// ── Wake-up + Boot ──

const btnWake = document.getElementById('btn-wake');

btnWake.addEventListener('click', async () => {
    const wakeLabel = document.getElementById('wake-label');
    const wakeLoading = document.getElementById('wake-loading');

    btnWake.disabled = true;
    btnWake.classList.add('loading');
    wakeLabel.classList.add('hidden');
    wakeLoading.classList.remove('hidden');

    try {
        await fetchSpeechToken();
        if (!state.speechToken) {
            setStatus('Speech service unavailable');
            btnWake.disabled = false;
            btnWake.classList.remove('loading');
            wakeLabel.classList.remove('hidden');
            wakeLoading.classList.add('hidden');
            return;
        }

        const avatarOk = await Promise.race([
            initAvatar(),
            new Promise((r) => setTimeout(() => r('timeout'), 15000)),
        ]);
        if (avatarOk === 'timeout') {
            console.warn('Avatar init timed out after 15s — proceeding');
        }
        if (state.avatarReady && !state.avatarVideoStream && state.avatarVideoReady) {
            await Promise.race([state.avatarVideoReady, new Promise((r) => setTimeout(r, 8000))]);
        }
    } catch (err) {
        console.warn('Avatar preload failed:', err.message);
    }

    showScreen('screen-main');

    if (state.avatarReady && state.avatarVideoStream) {
        setStatus('');
    } else if (!state.avatarReady) {
        const spinner = avatarPlaceholder.querySelector('.avatar-loading-spinner');
        if (spinner) spinner.remove();
        setStatus('Ready — speak or type to chat');
    }

    btnWake.disabled = false;
    btnWake.classList.remove('loading');
    wakeLabel.classList.remove('hidden');
    wakeLoading.classList.add('hidden');

    await triggerGreeting();

    const realtimeOk = await initRealtimeMode();

    if (realtimeOk) {
        console.log('HAILE: Realtime mode — starting mic audio stream');
        setStatus('');
        if (!state.isSpeaking && state.pendingSpeechCount === 0) {
            await startRealtimeAudioStream();
        }
    } else {
        console.log('HAILE: SSE mode (Realtime API unavailable)');
        if (!state.isSpeaking && state.pendingSpeechCount === 0) {
            startListening();
        }
    }

    console.log('HAILE: Boot complete — mode:', state.realtimeMode ? 'REALTIME' : 'SSE');
});
