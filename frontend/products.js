/**
 * HAILE — Product Data & Card Rendering
 *
 * Product metadata for on-screen display when the LLM emits
 * [product:ID] or [compare:ID1,ID2,ID3] tags.
 */

// ── Product catalogue ──

export const PRODUCTS = {
    intent: {
        name: 'Oticon Intent',
        tagline: 'World\'s first 4D sensor hearing aid',
        image: 'images/products/intent.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: '4D user-intent sensors, advanced noise reduction, hands-free calls',
        easeOfUse: 'Fully automatic',
        warranty: '3-year',
    },
    zeal: {
        name: 'Oticon Zeal',
        tagline: 'Does it all — unseen',
        image: 'images/products/zeal.jpg',
        tier: 'Premium',
        style: 'ITE (NXT)',
        loss: 'Mild–Moderate',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'BrainHearing DNN, nearly invisible, same-day fitting',
        easeOfUse: 'Automatic, easy charge case',
        warranty: '3-year',
    },
    real: {
        name: 'Oticon Real',
        tagline: 'Stay sharp in the real world',
        image: 'images/products/real.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'R: Rechargeable / T: Disposable',
        bluetooth: 'Full',
        features: 'Instant noise balancing, wind/handling noise reduction, DNN',
        easeOfUse: 'Automatic, telecoil option',
        warranty: '3-year',
    },
    bernafon_alpha: {
        name: 'Bernafon Alpha',
        tagline: 'Natural sound, effortless listening',
        image: 'images/products/bernafon_alpha.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Disposable (312)',
        bluetooth: 'Full',
        features: 'Hybrid Technology, speech-in-noise clarity, natural sound processing',
        easeOfUse: 'Automatic adaptation',
        warranty: '3-year',
    },
    bernafon_alpha_xt: {
        name: 'Bernafon Alpha XT',
        tagline: 'Enhanced clarity, rechargeable convenience',
        image: 'images/products/bernafon_alpha_xt.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'Hybrid Technology 2.0, enhanced noise management, streaming',
        easeOfUse: 'Rechargeable, automatic',
        warranty: '3-year',
    },
    bernafon_encanta: {
        name: 'Bernafon Encanta',
        tagline: 'Clear hearing, modern design',
        image: 'images/products/bernafon_encanta.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'Advanced sound processing, clear speech in noise, streaming',
        easeOfUse: 'Automatic, easy recharge',
        warranty: '3-year',
    },
    philips_hearlink_30: {
        name: 'Philips HearLink 30',
        tagline: 'Essential hearing, trusted brand',
        image: 'images/products/philips_hearlink_30.jpg',
        tier: 'Essential',
        style: 'ITC',
        loss: 'Mild–Moderate',
        battery: 'Disposable',
        bluetooth: 'Limited',
        features: 'SoundMap noise reduction, feedback cancellation, basic connectivity',
        easeOfUse: 'Simple controls',
        warranty: '2-year',
    },
    philips_hearlink_40: {
        name: 'Philips HearLink 40',
        tagline: 'Balanced performance, everyday confidence',
        image: 'images/products/philips_hearlink_40.jpg',
        tier: 'Mid-Range',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Disposable + telecoil',
        bluetooth: 'Full',
        features: 'SoundMap noise reduction, speech enhancement, streaming',
        easeOfUse: 'App control, telecoil option',
        warranty: '3-year',
    },
    philips_hearlink_50: {
        name: 'Philips HearLink 50',
        tagline: 'Premium performance, Philips quality',
        image: 'images/products/philips_hearlink_50.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'AI sound technology, advanced noise reduction, hands-free calls',
        easeOfUse: 'Fully automatic, rechargeable',
        warranty: '3-year',
    },
    resound_enzo_ia: {
        name: 'ReSound Enzo IA',
        tagline: 'Smart power for profound loss',
        image: 'images/products/resound_enzo_ia.jpg',
        tier: 'Power',
        style: 'BTE SP/UP',
        loss: 'Severe–Profound',
        battery: 'Disposable (13/675)',
        bluetooth: 'Full',
        features: 'All Access Directionality, Organic Hearing, max output with clarity',
        easeOfUse: 'Large, easy to handle',
        warranty: '3-year',
    },
    resound_savi: {
        name: 'ReSound Savi',
        tagline: 'Personalized sound, seamless connectivity',
        image: 'images/products/resound_savi.jpg',
        tier: 'Premium',
        style: 'BTE / ITC',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full (Auracast-ready)',
        features: 'Auracast, All Access Directionality, Organic Hearing, personalized sound',
        easeOfUse: 'App control, rechargeable',
        warranty: '3-year',
    },
    resound_vivia: {
        name: 'ReSound Vivia',
        tagline: 'All-in-one hearing and health',
        image: 'images/products/resound_vivia.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'Integrated health sensors, Organic Hearing, fall detection, streaming',
        easeOfUse: 'App control, health monitoring',
        warranty: '3-year',
    },
    widex_allure: {
        name: 'Widex Allure',
        tagline: 'Pure sound, elegant design',
        image: 'images/products/widex_allure.jpg',
        tier: 'Premium',
        style: 'BTE / ITE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'PureSound technology, zero delay processing, natural sound',
        easeOfUse: 'App control, rechargeable',
        warranty: '3-year',
    },
    widex_moment: {
        name: 'Widex Moment',
        tagline: 'The most natural sound',
        image: 'images/products/widex_moment.jpg',
        tier: 'Premium',
        style: 'BTE',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'ZeroDelay technology (<0.5ms), PureSound, machine-learning personalization',
        easeOfUse: 'App-based personalization',
        warranty: '3-year',
    },
    widex_smartric: {
        name: 'Widex SmartRIC',
        tagline: 'Smart design, outstanding sound',
        image: 'images/products/widex_smartric.jpg',
        tier: 'Premium',
        style: 'RIC',
        loss: 'Mild–Severe',
        battery: 'Rechargeable',
        bluetooth: 'Full',
        features: 'Smart microphone placement, PureSound, dual direction processing',
        easeOfUse: 'Ergonomic design, app control',
        warranty: '3-year',
    },
};

// ── Tag parsing ──

const PRODUCT_TAG_RE = /\[product:(\w+)\]/i;
const COMPARE_TAG_RE = /\[compare:([\w,]+)\]/i;

/**
 * Parse and strip [product:ID] and [compare:ID1,ID2,...] tags from text.
 * Returns { cleanText, productId, compareIds }.
 */
export function parseProductTags(text) {
    let cleanText = text;
    let productId = null;
    let compareIds = null;

    const pm = PRODUCT_TAG_RE.exec(cleanText);
    if (pm) {
        productId = pm[1].toLowerCase();
        cleanText = cleanText.replace(pm[0], '').trim();
    }

    const cm = COMPARE_TAG_RE.exec(cleanText);
    if (cm) {
        compareIds = cm[1].toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        cleanText = cleanText.replace(cm[0], '').trim();
    }

    return { cleanText, productId, compareIds };
}

// ── Card rendering ──

function productImageHtml(product) {
    return `<img src="${product.image}" alt="${product.name}"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="product-card-placeholder" style="display:none;">
                <span>${product.name.replace(/^(Oticon|Bernafon|Philips|ReSound|Widex)\s+/, '')}</span>
            </div>`;
}

/**
 * Create a single product card DOM element.
 */
export function createProductCard(productId) {
    const product = PRODUCTS[productId];
    if (!product) return null;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
        <div class="product-card-image">
            ${productImageHtml(product)}
        </div>
        <div class="product-card-info">
            <div class="product-card-name">${product.name}</div>
            <div class="product-card-tagline">${product.tagline}</div>
            <div class="product-card-specs">
                <span class="product-spec">${product.style}</span>
                <span class="product-spec">${product.battery}</span>
                <span class="product-spec">${product.tier}</span>
            </div>
        </div>
    `;
    return card;
}

/**
 * Create a side-by-side comparison card for 2–3 products.
 */
export function createComparisonCard(productIds) {
    const products = productIds.map(id => ({ id, ...PRODUCTS[id] })).filter(p => p.name);
    if (products.length < 2) return null;

    const rows = [
        { label: 'Tier', key: 'tier' },
        { label: 'Style', key: 'style' },
        { label: 'Hearing Loss', key: 'loss' },
        { label: 'Battery', key: 'battery' },
        { label: 'Bluetooth', key: 'bluetooth' },
        { label: 'Key Features', key: 'features' },
        { label: 'Ease of Use', key: 'easeOfUse' },
        { label: 'Warranty', key: 'warranty' },
    ];

    const colCount = products.length;
    const card = document.createElement('div');
    card.className = `comparison-card cols-${colCount}`;

    // Header row: product images + names
    const header = document.createElement('div');
    header.className = 'comparison-header';
    for (const p of products) {
        header.innerHTML += `
            <div class="comparison-product">
                <div class="comparison-product-image">
                    ${productImageHtml(p)}
                </div>
                <div class="comparison-product-name">${p.name}</div>
                <div class="comparison-product-tagline">${p.tagline}</div>
            </div>
        `;
    }
    card.appendChild(header);

    // Spec rows
    const table = document.createElement('div');
    table.className = 'comparison-table';
    for (const row of rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'comparison-row';
        rowEl.innerHTML = `<div class="comparison-label">${row.label}</div>`;
        for (const p of products) {
            rowEl.innerHTML += `<div class="comparison-value">${p[row.key] || '—'}</div>`;
        }
        table.appendChild(rowEl);
    }
    card.appendChild(table);

    return card;
}
