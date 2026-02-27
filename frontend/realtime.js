/**
 * HAILE — Realtime API Mode
 *
 * Azure OpenAI Realtime API: mic audio → WS → backend proxy → text phrases → avatar TTS.
 */

import { WS_BASE } from './config.js';
import { state } from './state.js';
import {
    escapeHtml,
    addBubble,
    startAssistantBubble,
    setListeningBadge,
    chatMessagesEl,
    btnMic,
} from './dom.js';
import { stopSpeaking, queueAvatarSentence, getMicStream } from './speech.js';

export async function initRealtimeMode() {
    return new Promise((resolve) => {
        try {
            const wsUrl = `${WS_BASE}/realtime`;
            state.realtimeWs = new WebSocket(wsUrl);
            state.realtimeWs.binaryType = 'arraybuffer';

            const timeout = setTimeout(() => {
                console.warn('Realtime WS: connection timeout');
                if (state.realtimeWs) {
                    try {
                        state.realtimeWs.close();
                    } catch (e) {
                        /* ignore */
                    }
                }
                state.realtimeWs = null;
                resolve(false);
            }, 8000);

            state.realtimeWs.onopen = () => {
                console.log('Realtime WS: connected, waiting for session...');
            };

            state.realtimeWs.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'session_ready') {
                    clearTimeout(timeout);
                    state.realtimeMode = true;
                    console.log('Realtime mode: ACTIVE');
                    resolve(true);
                    return;
                }
                handleRealtimeMessage(msg);
            };

            state.realtimeWs.onclose = () => {
                state.realtimeMode = false;
                state.realtimeWs = null;
                console.log('Realtime WS: closed');
            };

            state.realtimeWs.onerror = () => {
                clearTimeout(timeout);
                console.log('Realtime API not available — using SSE mode (this is normal)');
                state.realtimeMode = false;
                state.realtimeWs = null;
                resolve(false);
            };
        } catch (err) {
            console.warn('Realtime init error:', err);
            resolve(false);
        }
    });
}

function handleRealtimeMessage(msg) {
    switch (msg.type) {
        case 'phrase':
            if (!state.realtimeResponseActive) {
                startAssistantBubble();
                state.realtimeResponseActive = true;
                state.pendingRealtimeAssistantBubble = state.currentAssistantBubble;
            }
            if (state.speakingAborted) return;
            queueAvatarSentence(msg.ssml, msg.text);
            break;

        case 'done':
            if (msg.fullReply) {
                state.conversationMessages.push({ role: 'assistant', content: msg.fullReply });
            }
            state.currentAssistantBubble = null;
            state.realtimeResponseActive = false;
            break;

        case 'speech_started':
            if (state.isSpeaking) {
                stopSpeaking();
                state.realtimeResponseActive = false;
                if (state.realtimeWs && state.realtimeWs.readyState === WebSocket.OPEN) {
                    state.realtimeWs.send(JSON.stringify({ type: 'cancel_response' }));
                }
            }
            state.pendingRealtimeAssistantBubble = null;
            state.speakingAborted = false;
            setListeningBadge(true);
            break;

        case 'speech_stopped':
            setListeningBadge(false);
            break;

        case 'transcript': {
            const targetBubble =
                state.pendingRealtimeAssistantBubble || state.currentAssistantBubble;
            if (targetBubble && targetBubble.parentNode) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble user';
                bubble.innerHTML = `<p>${escapeHtml(msg.text)}</p>`;
                chatMessagesEl.insertBefore(bubble, targetBubble);
            } else {
                addBubble('user', msg.text);
            }
            state.conversationMessages.push({ role: 'user', content: msg.text });
            state.pendingRealtimeAssistantBubble = null;
            break;
        }

        case 'error':
            console.warn('Realtime error:', msg.error);
            break;
    }
}

export async function startRealtimeAudioStream() {
    if (state.realtimeAudioContext && state.realtimeAudioContext.state !== 'closed') return;

    const stream = await getMicStream();
    if (!stream) {
        console.warn('Realtime: no mic stream available');
        return;
    }

    // Azure OpenAI Realtime API expects 24kHz PCM16 mono
    state.realtimeAudioContext = new AudioContext({ sampleRate: 24000 });
    state.realtimeSourceNode =
        state.realtimeAudioContext.createMediaStreamSource(stream);

    // ScriptProcessor converts Float32 → PCM16 and sends via WebSocket
    state.realtimeProcessorNode = state.realtimeAudioContext.createScriptProcessor(2048, 1, 1);
    state.realtimeProcessorNode.onaudioprocess = (e) => {
        if (!state.realtimeWs || state.realtimeWs.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        state.realtimeWs.send(pcm16.buffer);
    };

    state.realtimeSourceNode.connect(state.realtimeProcessorNode);
    state.realtimeProcessorNode.connect(state.realtimeAudioContext.destination);
    setListeningBadge(true);
    btnMic.classList.add('listening');
    console.log('Realtime audio stream started (24kHz PCM16)');
}

export function stopRealtimeAudioStream() {
    if (state.realtimeProcessorNode) {
        state.realtimeProcessorNode.disconnect();
        state.realtimeProcessorNode = null;
    }
    if (state.realtimeSourceNode) {
        state.realtimeSourceNode.disconnect();
        state.realtimeSourceNode = null;
    }
    if (state.realtimeAudioContext && state.realtimeAudioContext.state !== 'closed') {
        state.realtimeAudioContext.close();
        state.realtimeAudioContext = null;
    }
    setListeningBadge(false);
    btnMic.classList.remove('listening');
}
