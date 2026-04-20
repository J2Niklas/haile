/**
 * HAILE — Configuration
 *
 * API endpoint and tuning constants.
 * The deploy script replaces the localhost URL for production.
 */

export const API_BASE = 'http://localhost:7071/api';
export const WS_BASE = API_BASE.replace('http', 'ws');

export const STT_SILENCE_MS = 600;
export const BARGEIN_MIN_WORDS = 2;
export const SPEECH_TOKEN_LIFETIME_MS = 8 * 60 * 1000;

export const GREETING_TEXT =
    "Hi there, great to see you! I'm AI avatar HAILE and I know a lot about HearingLife and hearing aid products. Go ahead, ask me anything!";

export const GREETINGS = {
    'en-US': GREETING_TEXT,
    'da-DK': 'Hej med dig, dejligt at se dig! Jeg er AI-avataren HAILE, og jeg ved en masse om HearingLife og høreapparatprodukter. Spørg mig bare om hvad som helst!',
    'de-DE': 'Hallo, schön dich zu sehen! Ich bin der KI-Avatar HAILE und ich weiß viel über HearingLife und Hörgeräteprodukte. Frag mich einfach alles!',
    'fr-FR': 'Bonjour, ravie de vous voir ! Je suis l\'avatar IA HAILE et je connais bien HearingLife et les produits auditifs. N\'hésitez pas à me poser vos questions !',
    'es-ES': '¡Hola, encantada de verte! Soy el avatar de IA HAILE y sé mucho sobre HearingLife y productos para audífonos. ¡Pregúntame lo que quieras!',
    'it-IT': 'Ciao, che bello vederti! Sono l\'avatar AI HAILE e conosco bene HearingLife e i prodotti per apparecchi acustici. Chiedimi quello che vuoi!',
    'pt-PT': 'Olá, que bom ver-te! Sou o avatar de IA HAILE e sei muito sobre a HearingLife e produtos de aparelhos auditivos. Pergunta-me o que quiseres!',
    'nl-NL': 'Hallo, leuk je te zien! Ik ben AI-avatar HAILE en ik weet veel over HearingLife en hoortoestellen. Vraag me gerust wat je wilt!',
    'sv-SE': 'Hej, kul att se dig! Jag är AI-avataren HAILE och jag kan mycket om HearingLife och hörapparatprodukter. Fråga mig vad du vill!',
    'nb-NO': 'Hei, hyggelig å se deg! Jeg er AI-avataren HAILE og jeg kan mye om HearingLife og høreapparatprodukter. Spør meg om hva som helst!',
};
