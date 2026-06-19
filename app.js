const FALLBACK_IMAGE = 'assets/no-image.png';
let GROUPS = [
  { id: 'all', label: 'Vše' }
];

const DEFAULT_DATA_CONFIG = {
  catalogUrl: 'products.json',
  imagesUrl: 'product-images.json',
  refreshIntervalMs: 180000,
  imagesRefreshIntervalMs: 3600000,
  cacheEnabled: true,
  useCachedCatalogOnError: true,
  maxCatalogAgeMinutes: 30,
  showDataStatus: true
};

let APP_CONFIG = {
  allowedRootCategories: [],
  showZeroAvailable: false,
  maxRenderedProducts: 240,
  headerMode: 'fixed',
  idleWarningSeconds: 90,
  idleResetSeconds: 30,
  data: { ...DEFAULT_DATA_CONFIG }
};

let PRODUCT_IMAGES = {};

const DEFAULT_MAX_RENDERED_PRODUCTS = 240;


const VAT_RATE = 0.21;

function getPriceNumberFromProduct(product) {
  const price = Number(product?.price ?? 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function formatMoney(value, currency = 'CZK') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Cena na dotaz';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(number);
}

function formatMoneyWithVat(value, currency = 'CZK') {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Cena na dotaz';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(number * (1 + VAT_RATE));
}

function getCartTotals() {
  return state.cart.reduce((totals, item) => {
    const product = state.products.find(row => row.id === item.id);
    const unitPrice = getPriceNumberFromProduct(product);
    const qty = Number(item.qty || 0);
    totals.net += unitPrice * qty;
    return totals;
  }, { net: 0 });
}


const state = {
  products: [],
  activeDynamicGroup: 'all',
  query: '',
  selectedId: null,
  detailOpen: false,
  checkoutStep: 0,
  checkoutType: 'private',
  checkoutDraft: loadCheckoutDraft(),
  cart: loadCart(),
  updatedAt: '',
  dataError: '',
  dataFromCache: false,
  lastSuccessfulCatalogLoad: ''
};

const el = {
  smartHeader: document.getElementById('smartHeader'),
  dynamicFilterBlock: document.getElementById('dynamicFilterBlock'),
  dynamicGroupFilters: document.getElementById('dynamicGroupFilters'),
  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  productGrid: document.getElementById('productGrid'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailPanel: document.getElementById('detailPanel'),
  resultTitle: document.getElementById('resultTitle'),
  resultCount: document.getElementById('resultCount'),
  emptyState: document.getElementById('emptyState'),
  cartButton: document.getElementById('cartButton'),
  cartCount: document.getElementById('cartCount'),
  cartTotal: document.getElementById('cartTotal'),
  cartDrawer: document.getElementById('cartDrawer'),
  closeCart: document.getElementById('closeCart'),
  cartItems: document.getElementById('cartItems'),
  cartFooter: document.getElementById('cartFooter'),
  checkoutArea: document.getElementById('checkoutArea'),
  exportOrder: document.getElementById('exportOrder'),
  clearCart: document.getElementById('clearCart'),
  idleModal: document.getElementById('idleModal'),
  idleContinue: document.getElementById('idleContinue'),
  idleReset: document.getElementById('idleReset'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  dataStatus: document.getElementById('dataStatus')
};

let lastScrollY = window.scrollY;
let headerHidden = false;
let tickingHeader = false;

function updateHeaderHeight() {
  if (!el.smartHeader) return;
  document.documentElement.style.setProperty('--smart-header-height', `${Math.ceil(el.smartHeader.offsetHeight)}px`);
}

function setSmartHeaderHidden(hidden) {
  headerHidden = hidden;
  if (el.smartHeader) el.smartHeader.classList.toggle('header-hidden', hidden);
}

function handleSmartHeaderScroll() {
  const currentY = window.scrollY;
  const delta = currentY - lastScrollY;

  if (currentY < 45 || document.activeElement === el.searchInput) {
    setSmartHeaderHidden(false);
  } else if (delta > 8 && currentY > 120) {
    setSmartHeaderHidden(true);
  } else if (delta < -8) {
    setSmartHeaderHidden(false);
  }

  lastScrollY = currentY;
  tickingHeader = false;
}

init();

async function init() {

  if (typeof installTapSound === 'function') {
    installTapSound();
  }

  bindEvents();
  setLoadingState(true, 'Načítám nastavení kiosku…');

  await loadConfig();
  setLoadingState(true, 'Načítám obrázky a katalog…');
  await loadProductImages();
  await loadCatalog();

  render();
  updateHeaderHeight();
  restoreCheckoutDraft();
  installIdleWatcher();
  startDataRefreshTimers();
  setLoadingState(false);

  window.addEventListener('resize', updateHeaderHeight);

  // Auto-hide hlavičky pouze pokud je povolen v config.json
  if (APP_CONFIG.headerMode === 'autoHide') {
    window.addEventListener('scroll', () => {
      if (!tickingHeader) {
        window.requestAnimationFrame(handleSmartHeaderScroll);
        tickingHeader = true;
      }
    }, { passive: true });
  } else {
    setSmartHeaderHidden(false);
  }
}

const CACHE_KEYS = {
  catalog: 'verkon.kiosk.catalog.cache.v1',
  images: 'verkon.kiosk.images.cache.v1'
};

function getDataConfig() {
  return {
    ...DEFAULT_DATA_CONFIG,
    ...(APP_CONFIG.data && typeof APP_CONFIG.data === 'object' ? APP_CONFIG.data : {})
  };
}

function setLoadingState(visible, message = '') {
  if (!el.loadingOverlay) return;
  el.loadingOverlay.hidden = !visible;
  if (el.loadingText && message) el.loadingText.textContent = message;
}

function setDataStatus(message = '', tone = 'ok') {
  if (!el.dataStatus) return;
  const dataConfig = getDataConfig();
  el.dataStatus.hidden = !message || !dataConfig.showDataStatus;
  el.dataStatus.textContent = message || '';
  el.dataStatus.className = `data-status ${tone}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Cache se nepodařilo přečíst.', error);
    return null;
  }
}

function writeCache(key, data) {
  const dataConfig = getDataConfig();
  if (!dataConfig.cacheEnabled) return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch (error) {
    console.warn('Cache se nepodařilo uložit.', error);
  }
}

function getCacheAgeMinutes(cache) {
  if (!cache || !cache.savedAt) return null;
  const saved = new Date(cache.savedAt).getTime();
  if (!Number.isFinite(saved)) return null;
  return Math.round((Date.now() - saved) / 60000);
}

async function loadConfig() {
  try {
    const config = await fetchJson('config.json');

    APP_CONFIG = {
      ...APP_CONFIG,
      ...config,
      data: {
        ...DEFAULT_DATA_CONFIG,
        ...(config.data && typeof config.data === 'object' ? config.data : {})
      }
    };
  } catch (error) {
    console.warn('config.json se nepodařilo načíst, používám výchozí nastavení.', error);
  }
}

async function loadProductImages(options = {}) {
  const dataConfig = getDataConfig();
  const url = dataConfig.imagesUrl || DEFAULT_DATA_CONFIG.imagesUrl;

  try {
    const data = await fetchJson(url);
    PRODUCT_IMAGES = data && typeof data === 'object' ? data : {};
    writeCache(CACHE_KEYS.images, PRODUCT_IMAGES);
    if (!options.silent) setDataStatus('Obrázky načteny', 'ok');
    return true;
  } catch (error) {
    console.warn(`${url} se nepodařilo načíst, zkouším cache obrázků.`, error);
    const cached = readCache(CACHE_KEYS.images);
    if (cached && cached.data && typeof cached.data === 'object') {
      PRODUCT_IMAGES = cached.data;
      if (!options.silent) setDataStatus('Obrázky z poslední uložené verze', 'warn');
      return true;
    }
    PRODUCT_IMAGES = {};
    if (!options.silent) setDataStatus('Obrázky nejsou dostupné', 'warn');
    return false;
  }
}

function applyCatalogData(data, options = {}) {
  const products = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
  if (!products.length) throw new Error('Katalog neobsahuje žádné produkty.');

  state.updatedAt = Array.isArray(data) ? '' : (data.updatedAt || '');
  state.products = products
    .map(normalizeProduct)
    .filter(applyConfigFilter);
  GROUPS = buildGroupsFromProducts(state.products);
  state.dataError = '';
  state.dataFromCache = Boolean(options.fromCache);
  state.lastSuccessfulCatalogLoad = new Date().toISOString();

  if (state.selectedId && !state.products.some(product => product.id === state.selectedId)) {
    closeDetail();
  }
}

function setCatalogLoadError(error, cache) {
  const age = getCacheAgeMinutes(cache);
  const ageText = Number.isFinite(age) ? ` Cache je stará přibližně ${age} min.` : '';
  state.dataError = `Katalog se nepodařilo načíst.${ageText}`;
  console.error(error);
}

async function loadCatalog(options = {}) {
  const dataConfig = getDataConfig();
  const url = dataConfig.catalogUrl || DEFAULT_DATA_CONFIG.catalogUrl;
  const useCacheFallback = options.useCacheFallback !== false && dataConfig.useCachedCatalogOnError;

  try {
    const data = await fetchJson(url);
    applyCatalogData(data, { fromCache: false });
    writeCache(CACHE_KEYS.catalog, data);
    setDataStatus(state.updatedAt ? `Data Helios: ${state.updatedAt}` : 'Katalog aktuální', 'ok');
    return true;
  } catch (error) {
    const cached = useCacheFallback ? readCache(CACHE_KEYS.catalog) : null;
    if (cached && cached.data) {
      try {
        applyCatalogData(cached.data, { fromCache: true });
        setCatalogLoadError(error, cached);
        setDataStatus('Používám poslední uložený katalog', 'warn');
        return true;
      } catch (cacheError) {
        console.error('Cache katalogu je poškozená.', cacheError);
      }
    }

    state.products = [];
    state.updatedAt = '';
    state.dataFromCache = false;
    setCatalogLoadError(error, cached);
    setDataStatus('Katalog není dostupný', 'error');
    return false;
  }
}

function startDataRefreshTimers() {
  const dataConfig = getDataConfig();
  const catalogInterval = Number(dataConfig.refreshIntervalMs || 0);
  const imagesInterval = Number(dataConfig.imagesRefreshIntervalMs || 0);

  if (catalogInterval > 0) {
    window.setInterval(async () => {
      const ok = await loadCatalog({ silent: true });
      if (ok) render();
    }, catalogInterval);
  }

  if (imagesInterval > 0) {
    window.setInterval(async () => {
      const ok = await loadProductImages({ silent: true });
      if (ok) {
        state.products = state.products.map((product, index) => normalizeProduct(product, index));
        render();
      }
    }, imagesInterval);
  }
}


function applyConfigFilter(product) {
  const allowedRoots = Array.isArray(APP_CONFIG.allowedRootCategories)
    ? APP_CONFIG.allowedRootCategories.map(String)
    : [];

  if (allowedRoots.length && !allowedRoots.includes(String(product.assortment_root || ''))) {
    return false;
  }

  const availableQty = Number(product.available_qty ?? 0);

  if (!APP_CONFIG.showZeroAvailable && (!Number.isFinite(availableQty) || availableQty <= 0)) {
    return false;
  }

  return true;
}


function normalizeProduct(product, index) {
  const category = String(product.assortment_name || '');
  const groupLabel = String(product.assortment_root_name || 'Ostatní');
  const group = slugify(groupLabel);

  const normalized = {
    ...product,
    id: String(product.id || product.code || index),
    code: String(product.code || ''),
    name: String(product.name || 'Produkt bez názvu'),
    manufacturer: String(product.manufacturer || ''),
    group,
    groupLabel,
    category,
    chapter: category,
    priceText: formatPrice(product.price, 'CZK'),
    stock: formatStock(product),
    description: '',
    image: String(PRODUCT_IMAGES[String(product.code || '')] || ''),
    url: String(product.product_url || ''),
    package: String(product.unit || ''),
    quality: '',
    categoryTop: String(product.assortment_root_name || ''),
    categorySecond: '',
    categoryThird: String(product.assortment_name || ''),
    tags: []
  };
  normalized.searchIndex = buildSearchIndex(normalized);
  normalized.searchText = normalized.searchIndex.all.normalized;
  return normalized;
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'ostatni';
}

function buildGroupsFromProducts(products) {
  const map = new Map([['all', 'Vše']]);
  products.forEach(product => {
    if (product.group && !map.has(product.group)) {
      map.set(product.group, product.groupLabel || getGroupLabel(product.group));
    }
  });
  return Array.from(map, ([id, label]) => ({ id, label }));
}

function bindEvents() {
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim();
    setSmartHeaderHidden(false);
    closeDetail();
    state.activeDynamicGroup = 'all';
    render();
  });

  el.clearSearch.addEventListener('click', () => {
    state.query = '';
    setSmartHeaderHidden(false);
    state.activeDynamicGroup = 'all';
    closeDetail();
    el.searchInput.value = '';
    el.searchInput.focus();
    render();
  });

  el.searchInput.addEventListener('focus', () => setSmartHeaderHidden(false));
  el.cartButton.addEventListener('click', openCart);
  el.closeCart.addEventListener('click', closeCart);
  el.cartDrawer.addEventListener('click', (event) => {
    if (event.target === el.cartDrawer) closeCart();
  });
  if (el.detailDrawer) {
    el.detailDrawer.addEventListener('click', (event) => {
      if (event.target.matches('[data-close-detail]')) closeDetail();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (el.detailDrawer && !el.detailDrawer.hidden) closeDetail();
    else closeCart();
  });
  el.exportOrder.addEventListener('click', handleCheckoutNext);
  el.clearCart.addEventListener('click', () => {
    state.cart = [];
    state.checkoutStep = 0;
    clearCheckoutDraft();
    saveCart();
    renderCart();
    renderCheckout();
    updateCheckoutButtons();
    renderCartCount();
  });

  document.addEventListener('input', (event) => {
    if (event.target && event.target.matches && event.target.matches('.checkout-form input')) {
      saveCheckoutDraftFromForm();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target && event.target.name === 'customerType') {
      state.checkoutType = event.target.value;
      saveCheckoutDraftFromForm();
    }
  });

  if (el.idleContinue) {
    el.idleContinue.addEventListener('click', () => {
      hideIdleWarning();
      resetIdleTimers();
    });
  }

  if (el.idleReset) {
    el.idleReset.addEventListener('click', () => {
      resetKioskSession();
    });
  }
}

function render() {
  const result = getFilteredProducts();
  renderDynamicFilters(result.queryProducts);
  renderGrid(result.products);
  renderTitle(result.products.length, result.queryProducts.length);
  renderDetail();
  renderCartCount();
  updateHeaderHeight();
}

function getFilteredProducts() {
  const query = parseQuery(state.query);

  if (!query.normalized) {
    const baseProducts = state.products;
    const products = state.activeDynamicGroup === 'all'
      ? baseProducts
      : baseProducts.filter(product => product.group === state.activeDynamicGroup);
    return { queryProducts: baseProducts, products };
  }

  const queryProducts = state.products
    .map(product => ({ product, score: scoreProduct(product, query) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'cs'))
    .map(result => result.product);

  const products = state.activeDynamicGroup === 'all'
    ? queryProducts
    : queryProducts.filter(product => product.group === state.activeDynamicGroup);

  return { queryProducts, products };
}
function renderDynamicFilters(queryProducts) {
  const counts = new Map();
  queryProducts.forEach(product => {
    const id = product.group || 'ostatni';
    const current = counts.get(id) || { id, label: product.groupLabel || getGroupLabel(id), count: 0 };
    current.count += 1;
    counts.set(id, current);
  });

  const groups = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'cs'));
  const ids = new Set(groups.map(group => group.id));
  if (state.activeDynamicGroup !== 'all' && !ids.has(state.activeDynamicGroup)) {
    state.activeDynamicGroup = 'all';
  }

  el.dynamicFilterBlock.hidden = false;
  el.dynamicGroupFilters.innerHTML = [
    { id: 'all', label: state.query ? 'Vše v hledání' : 'Vše', count: queryProducts.length },
    ...groups
  ].map(group => `
    <button class="filter dynamic-filter${group.id === state.activeDynamicGroup ? ' active' : ''}" type="button" data-group="${escapeHtml(group.id)}">
      ${escapeHtml(group.label)} <span>${group.count}</span>
    </button>
  `).join('');

  el.dynamicGroupFilters.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      state.activeDynamicGroup = button.dataset.group;
      closeDetail();
      render();
    });
  });
}
function buildSearchIndex(product) {
  return {
    code: indexField(product.code),
    name: indexField(product.name),
    manufacturer: indexField(product.manufacturer),
    category: indexField([product.category, product.categoryTop, product.categorySecond, product.categoryThird].filter(Boolean).join(' ')),
    details: indexField([product.description, product.package, product.quality, ...(product.tags || [])].join(' ')),
    all: indexField([
      product.name,
      product.code,
      product.manufacturer,
      product.description,
      product.package,
      product.quality,
      product.chapter,
      product.category,
      product.categoryTop,
      product.categorySecond,
      product.categoryThird,
      product.url,
      ...(product.tags || [])
    ].join(' '))
  };
}

function indexField(value) {
  const normalized = normalize(value);
  return {
    normalized,
    compact: compact(normalized),
    tokens: tokenize(normalized)
  };
}

function parseQuery(value) {
  const normalized = normalize(value);
  return {
    original: String(value || '').trim(),
    normalized,
    compact: compact(normalized),
    tokens: tokenize(normalized)
  };
}

function scoreProduct(product, query) {
  const idx = product.searchIndex;
  let score = 0;

  score = Math.max(score, scoreField(idx.code, query, 120, 95, 80));
  score = Math.max(score, scoreField(idx.name, query, 100, 85, 70));
  score = Math.max(score, scoreField(idx.manufacturer, query, 55, 45, 35));
  score = Math.max(score, scoreField(idx.category, query, 40, 32, 24));
  score = Math.max(score, scoreField(idx.details, query, 25, 20, 14));

  return score;
}

function scoreField(field, query, compactStartScore, phraseStartScore, tokenStartScore) {
  if (!field.normalized || !query.normalized) return 0;

  if (field.compact && field.compact === query.compact) return compactStartScore + 40;
  if (field.compact && field.compact.startsWith(query.compact)) return compactStartScore;
  if (field.normalized.startsWith(query.normalized)) return phraseStartScore;

  if (query.tokens.length === 1) {
    return field.tokens.some(token => token.startsWith(query.tokens[0])) ? tokenStartScore : 0;
  }

  const allTokensMatch = query.tokens.every(queryToken => field.tokens.some(fieldToken => fieldToken.startsWith(queryToken)));
  return allTokensMatch ? tokenStartScore - 5 : 0;
}


function renderGrid(products) {
  const limit = Number(APP_CONFIG.maxRenderedProducts || DEFAULT_MAX_RENDERED_PRODUCTS);
  const visibleProducts = products.slice(0, limit);
  el.emptyState.hidden = products.length > 0;
  if (products.length === 0) {
    el.emptyState.innerHTML = state.dataError
      ? `<h3>Katalog se nepodařilo načíst</h3><p>${escapeHtml(state.dataError)}</p>`
      : '<h3>Nic jsme nenašli</h3><p>Zkuste jiný název, kód, výrobce nebo obecnější slovo.</p>';
  }

  el.productGrid.innerHTML = visibleProducts.map(product => {
    const unavailableClass = Number(product.available_qty ?? 0) <= 0 ? ' unavailable' : '';

    return `
      <button class="product-card${product.id === state.selectedId ? ' selected' : ''}${unavailableClass}" type="button" data-id="${escapeHtml(product.id)}">
  ${renderProductVisual(product)}
  <h3>${escapeHtml(product.name)}</h3>
  <div class="product-meta">${escapeHtml(product.code || '')}</div>
  <div class="product-footer">
    <div class="product-price">${escapeHtml(product.priceText)}</div>
    <div class="product-stock">${escapeHtml(product.stock)}</div>
  </div>
</button>
    `;
  }).join('');

  el.productGrid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      openDetail(card.dataset.id);
    });
  });
}

function renderProductVisual(product) {
  if (product.image) {
    return `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'" />`;
  }
  return `<img class="fallback-image" src="${FALLBACK_IMAGE}" alt="Bez fotografie" />`;
}

function createPlaceholder(label = '') {
  const img = document.createElement('img');
  img.src = 'assets/no-image.png';
  img.alt = 'Bez fotografie';
  img.className = 'fallback-image';
  return img;
}

function renderTitle(count, totalBeforeDynamic = count) {
  const limit = Number(
    APP_CONFIG.maxRenderedProducts || DEFAULT_MAX_RENDERED_PRODUCTS
  );

  el.resultTitle.textContent = state.query
    ? `Výsledky pro „${state.query}“`
    : 'Kompletní sortiment';

  const shown = Math.min(count, limit);
  const shownText = count > limit
    ? ` · zobrazeno prvních ${shown}`
    : '';

  const dynamicText = state.activeDynamicGroup !== 'all'
    ? ` · zúženo z ${totalBeforeDynamic}`
    : '';

  const relevanceText = state.query
    ? ' · řazeno podle relevance'
    : '';

  const updated = state.updatedAt
    ? ` · data ${state.updatedAt}`
    : '';

  el.resultCount.textContent =
    `${count} produktů${dynamicText}${shownText}${relevanceText}${updated}`;
}


function openDetail(productId) {
  state.selectedId = productId;
  state.detailOpen = true;
  renderDetail();
}

function closeDetail() {
  state.selectedId = null;
  state.detailOpen = false;
  if (el.detailDrawer) el.detailDrawer.hidden = true;
}

function renderDetail() {
  const product = state.products.find(item => item.id === state.selectedId);

  if (!product || !state.detailOpen) {
    if (el.detailDrawer) el.detailDrawer.hidden = true;
    if (el.detailPanel) el.detailPanel.innerHTML = '';
    return;
  }

  if (el.detailDrawer) el.detailDrawer.hidden = false;

  const cartItem = state.cart.find(item => item.id === product.id);
  const qtyInCart = cartItem ? cartItem.qty : 0;
  const availableQty = getAvailableQty(product);
  const maxQty = availableQty > 0 ? Math.max(1, Math.floor(availableQty - qtyInCart)) : 1;
  const unitText = String(product.package || product.unit || '').trim();

  const priceNet = Number(product.price || 0);
  const priceGross = Number.isFinite(priceNet) && priceNet > 0 ? priceNet * (1 + (typeof VAT_RATE !== 'undefined' ? VAT_RATE : 0.21)) : 0;
  const priceNetText = Number.isFinite(priceNet) && priceNet > 0
    ? formatMoney(priceNet)
    : String(product.priceText || 'Cena na dotaz').replace(' bez DPH', '');
  const priceGrossText = priceGross > 0 ? formatMoney(priceGross) : '';

  el.detailPanel.innerHTML = `
    <div class="detail-clean">
      <header class="detail-clean-header">
        <h3>${escapeHtml(product.name)}</h3>
        <button class="detail-close" type="button" id="closeDetail" aria-label="Zavřít detail">×</button>
      </header>

      <div class="detail-clean-body">
        <section class="detail-clean-visual">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.onerror=null;this.src='assets/no-image.png'" />` : `<img class="fallback-image" src="assets/no-image.png" alt="Bez fotografie" />`}
        </section>

        <section class="detail-clean-info">
          <div class="detail-clean-facts">
            ${product.manufacturer ? `<div><span>Výrobce</span><strong>${escapeHtml(product.manufacturer)}</strong></div>` : ''}
            ${(product.assortment_root_name || product.assortment_name) ? `<div><span>Sortiment</span><strong>${escapeHtml(product.assortment_root_name ? (product.assortment_root_name + (product.assortment_name ? ' / ' + product.assortment_name : '')) : product.assortment_name)}</strong></div>` : ''}
            ${product.code ? `<div><span>Kód</span><strong>${escapeHtml(product.code)}</strong></div>` : ''}
            <div><span>Dostupnost</span><strong class="${Number(product.available_qty ?? 0) > 0 ? 'is-available' : 'is-unavailable'}">${escapeHtml(product.stock)}</strong></div>
          </div>

          <div class="detail-clean-price">
            <div class="detail-clean-price-net">
              <strong>${escapeHtml(priceNetText)}</strong>
              <span>bez DPH</span>
            </div>
            ${priceGrossText ? `
              <div class="detail-clean-price-gross">
                <strong>${escapeHtml(priceGrossText)}</strong>
                <span>vč. DPH</span>
              </div>
            ` : ''}
          </div>

          <div class="detail-clean-qty">
            <div class="qty-label">Množství${unitText ? ` <span>(${escapeHtml(unitText)})</span>` : ''}</div>
            <div class="qty-box" aria-label="Množství">
              <button class="qty-button" type="button" id="qtyMinus">−</button>
              <input id="qtyInput" class="qty-input" type="number" min="1" max="${escapeHtml(maxQty)}" step="1" value="1" inputmode="numeric" pattern="[0-9]*" />
              <button class="qty-button" type="button" id="qtyPlus">+</button>
            </div>
            <div class="qty-help">Maximum pro přidání: ${escapeHtml(formatNumber(maxQty))}${unitText ? ` ${escapeHtml(unitText)}` : ''}</div>
          </div>

          <div class="detail-clean-actions">
            <button class="primary order-primary" type="button" id="addToCart">Vložit do košíku</button>
            ${product.url ? '<button class="secondary" type="button" id="openWeb">Technické údaje / web</button>' : ''}
            <button class="secondary" type="button" id="verifyOnline">Ověřit aktuální dostupnost</button>
            <div id="verifyResult" class="verify-result"></div>
            <button class="secondary" type="button" id="showCart">Zobrazit košík${qtyInCart ? ` (${qtyInCart}× v košíku)` : ''}</button>
          </div>
        </section>
      </div>
    </div>
  `;

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  const qtyInput = document.getElementById('qtyInput');
  document.getElementById('qtyMinus').addEventListener('click', () => setQty(getQty() - 1));
  document.getElementById('qtyPlus').addEventListener('click', () => setQty(getQty() + 1));
  qtyInput.addEventListener('input', () => clampQtyInput());
  qtyInput.addEventListener('blur', () => clampQtyInput(true));
  document.getElementById('addToCart').addEventListener('click', () => addToCart(product, getQty()));
  document.getElementById('showCart').addEventListener('click', openCart);

  const openWeb = document.getElementById('openWeb');
  const verifyOnline = document.getElementById('verifyOnline');
  if (openWeb) openWeb.addEventListener('click', () => openProductWeb(product));
  if (verifyOnline) verifyOnline.addEventListener('click', () => verifyProductOnline(product));

  function getQty() {
    const value = Number(qtyInput.value);
    return clampQty(value, maxQty);
  }

  function setQty(value) {
    qtyInput.value = String(clampQty(value, maxQty));
  }

  function clampQtyInput(forceValue = false) {
    const value = Number(qtyInput.value);
    if (!qtyInput.value && !forceValue) return;
    qtyInput.value = String(clampQty(value, maxQty));
  }
}

async function verifyProductOnline(product) {
  const resultEl = document.getElementById('verifyResult');
  const btn = document.getElementById('verifyOnline');
  if (!resultEl || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Ověřuji…';
  resultEl.className = 'verify-result';
  resultEl.textContent = '';

  try {
    const res = await fetch(`verify-product.php?id=${encodeURIComponent(product.id)}`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Neznámá chyba');
    }

    const priceChanged = Math.abs(data.price - Number(product.price)) > 0.001;
    const qtyText = data.available_qty > 0
      ? `Skladem: ${formatNumber(data.available_qty)} ks`
      : 'Aktuálně není skladem';

    resultEl.classList.add(data.available_qty > 0 ? 'is-ok' : 'is-warning');
    resultEl.innerHTML = `
      <strong>${qtyText}</strong><br>
      Aktuální cena: ${formatNumber(data.price)} Kč
      ${priceChanged ? ` <span class="price-changed">(změna z ${formatNumber(product.price)} Kč)</span>` : ''}
    `;
  } catch (err) {
    resultEl.classList.add('is-error');
    resultEl.textContent = 'Ověření se nezdařilo, zkuste to prosím znovu.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ověřit aktuální dostupnost';
  }
}

function openProductWeb(product) {
  if (!product.url) return;

  // V Electronu půjde toto zachytit přes window.open / BrowserWindow handler
  // a otevřít produkt do vlastního řízeného okna.
  window.open(product.url, '_blank', 'noopener');
}

function fact(label, value) {
  const text = String(value ?? '').trim();

  if (!text) return '';
  if (text.toLowerCase() === 'neurčeno') return '';

  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`;
}

function addToCart(product, qty = 1) {
  const availableQty = getAvailableQty(product);
  const existing = state.cart.find(item => item.id === product.id);
  const currentQty = existing ? existing.qty : 0;
  const remainingQty = availableQty > 0 ? Math.max(0, Math.floor(availableQty - currentQty)) : 0;
  const amount = Math.min(clampQty(qty, remainingQty || 1), remainingQty || 1);

  if (availableQty > 0 && remainingQty <= 0) {
    alert('Tento produkt už máte v objednávce v maximálním skladovém množství.');
    openCart();
    return;
  }

  if (existing) existing.qty = Math.min(currentQty + amount, Math.floor(availableQty));
  else state.cart.push({ id: product.id, code: product.code, name: product.name, price: product.priceText, url: product.url || '', unit: product.package || product.unit || '', qty: amount });
  saveCart();
  renderCartCount();
  pulseCartButton();
  openCart();
}

function openCart() {
  closeDetail();
  state.checkoutStep = 0;
  renderCart();
  renderCheckout();
  updateCheckoutButtons();
  el.cartDrawer.hidden = false;
}

function closeCart() {
  state.checkoutStep = 0;
  renderCheckout();
  el.cartDrawer.hidden = true;
}

function renderCart() {
  if (!state.cart.length) {
    if (el.cartFooter) el.cartFooter.hidden = true;
    el.cartItems.innerHTML = '<p class="cart-empty">Košík je prázdný.<br><span>Vyberte produkty z katalogu.</span></p>';
    return;
  }

  if (el.cartFooter) el.cartFooter.hidden = false;

  const totals = getCartTotals();
  const vat = totals.net * VAT_RATE;
  const gross = totals.net + vat;

  el.cartItems.innerHTML = `
    <div class="cart-list">
      ${state.cart.map(item => {
        const product = state.products.find(row => row.id === item.id);
        const image = product?.image || '';
        const group = product?.group || 'produkt';
        const unit = item.unit || product?.package || product?.unit || '';
        const availableQty = product ? getAvailableQty(product) : 0;
        const stockText = availableQty > 0
          ? `Skladem: ${formatNumber(availableQty)}${unit ? ' ' + unit : ''}`
          : '';

        const unitPrice = getPriceNumberFromProduct(product);
        const qty = Number(item.qty || 0);
        const lineNet = unitPrice * qty;
        const lineGross = lineNet * (1 + VAT_RATE);
        const codeText = item.code ? `Kód: ${item.code}` : '';

        return `
          <div class="cart-row" data-id="${escapeHtml(item.id)}">
            <div class="cart-thumb">
              ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.replaceWith(createPlaceholder('${escapeHtml(group)}'))" />` : `<div class="cart-thumb-placeholder">${escapeHtml(getGroupLabel(group))}</div>`}
            </div>

            <div class="cart-main">
              <strong>${escapeHtml(item.name)}</strong>
              <div class="cart-meta-line">
                ${codeText ? `<span>${escapeHtml(codeText)}</span>` : ''}
                ${stockText ? `<span class="cart-stock-inline">${escapeHtml(stockText)}</span>` : ''}
              </div>
              <div class="cart-prices compact-prices">
                <strong>${escapeHtml(formatMoney(lineNet))}</strong><span>bez DPH</span>
                <em>|</em>
                <strong>${escapeHtml(formatMoney(lineGross))}</strong><span>vč. DPH</span>
              </div>
            </div>

            <div class="cart-row-actions">
              <button type="button" class="cart-qty" data-cart-minus="${escapeHtml(item.id)}">−</button>
              <span>${escapeHtml(item.qty)}×</span>
              <button type="button" class="cart-qty" data-cart-plus="${escapeHtml(item.id)}">+</button>
              <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(item.id)}" aria-label="Odebrat položku">🗑</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="cart-summary">
      <div><span>Celkem bez DPH</span><strong>${escapeHtml(formatMoney(totals.net))}</strong></div>
      <div><span>DPH 21 %</span><strong>${escapeHtml(formatMoney(vat))}</strong></div>
      <div class="cart-summary-total"><span>Celkem vč. DPH</span><strong>${escapeHtml(formatMoney(gross))}</strong></div>
    </div>
  `;

  el.cartItems.querySelectorAll('[data-cart-minus]').forEach(button => {
    button.addEventListener('click', () => changeCartQty(button.dataset.cartMinus, -1));
  });
  el.cartItems.querySelectorAll('[data-cart-plus]').forEach(button => {
    button.addEventListener('click', () => changeCartQty(button.dataset.cartPlus, 1));
  });
  el.cartItems.querySelectorAll('[data-cart-remove]').forEach(button => {
    button.addEventListener('click', () => removeCartItem(button.dataset.cartRemove));
  });
}

function changeCartQty(productId, delta) {
  const item = state.cart.find(row => row.id === productId);
  if (!item) return;
  const product = state.products.find(row => row.id === productId);
  const maxQty = product ? Math.floor(getAvailableQty(product)) : Infinity;

  item.qty += delta;

  if (Number.isFinite(maxQty) && maxQty > 0 && item.qty > maxQty) item.qty = maxQty;
  if (item.qty < 1) item.qty = 1;

  saveCart();
  renderCart();
  renderCartCount();
  pulseCartButton();
  renderDetail();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter(row => row.id !== productId);
  saveCart();
  renderCart();
  renderCartCount();
  pulseCartButton();
  renderDetail();
}

function renderCartCount() {
  const lineCount = state.cart.length;

  if (lineCount === 0) {
    if (el.cartCount) el.cartCount.textContent = 'Prázdný košík';
    if (el.cartTotal) el.cartTotal.textContent = '';
    if (el.cartButton) el.cartButton.classList.remove('has-items');
    return;
  }

  if (el.cartCount) {
    el.cartCount.textContent = `Košík (${lineCount})`;
  }

  if (el.cartTotal) {
    const totals = typeof getCartTotals === 'function' ? getCartTotals() : { net: 0 };
    const gross = Number(totals.net || 0) * (1 + (typeof VAT_RATE !== 'undefined' ? VAT_RATE : 0.21));
    el.cartTotal.textContent = `${formatMoney(gross)} vč. DPH`;
  }

  if (el.cartButton) {
    el.cartButton.classList.add('has-items');
  }
}

function handleCheckoutNext() {
  if (!state.cart.length) {
    alert('Objednávka je prázdná.');
    return;
  }

  if (state.checkoutStep === 0) {
    state.checkoutStep = 1;
    renderCheckout();
    return;
  }

  if (state.checkoutStep === 1) {
    const selected = document.querySelector('input[name="customerType"]:checked');
    state.checkoutType = selected ? selected.value : 'private';
    saveCheckoutDraftFromForm();
    state.checkoutStep = 2;
    renderCheckout();
    return;
  }

  if (state.checkoutStep === 2) {
    if (!validateCheckoutForm()) return;
    state.checkoutStep = 3;
    renderCheckout();
    return;
  }

  if (state.checkoutStep === 3) {
    finishCheckout();
  }
}

function renderCheckout() {
  if (!el.checkoutArea || !el.exportOrder) return;

  if (state.checkoutStep === 0) {
    el.checkoutArea.hidden = true;
    el.checkoutArea.innerHTML = '';
    el.exportOrder.textContent = 'Pokračovat v objednávce';
    return;
  }

  el.checkoutArea.hidden = false;

  if (state.checkoutStep === 1) {
    el.exportOrder.textContent = 'Pokračovat na údaje';
    el.checkoutArea.innerHTML = `
      <div class="checkout-box">
        <div class="checkout-progress">
          <span class="active">1 Typ zákazníka</span>
          <span>2 Údaje</span>
          <span>3 Potvrzení</span>
        </div>
        <h3>Objednávka pro firmu nebo soukromě?</h3>
        <div class="customer-type-grid">
          <label class="customer-type-card">
            <input type="radio" name="customerType" value="company" ${state.checkoutType === 'company' ? 'checked' : ''}>
            <strong>Firma</strong>
            <span>Název firmy, IČO a kontakt</span>
          </label>
          <label class="customer-type-card">
            <input type="radio" name="customerType" value="private" ${state.checkoutType === 'private' ? 'checked' : ''}>
            <strong>Soukromá osoba</strong>
            <span>Jméno a kontakt</span>
          </label>
        </div>
        <p class="checkout-note">Platba proběhne na prodejně. Převzetí je osobně ihned na prodejně.</p>
      </div>
    `;
    return;
  }

  if (state.checkoutStep === 2) {
    el.exportOrder.textContent = 'Pokračovat na potvrzení';

    const companyFields = `
      <label>IČO *<input id="checkoutIco" type="text" inputmode="numeric" autocomplete="off"></label>
      <div class="ares-row">
        <button id="loadAres" class="secondary ares-button" type="button" disabled>Načíst z ARES</button>
        <span>Doplní název firmy a adresu podle IČO</span>
      </div>
      <label>Název firmy<input id="checkoutCompany" type="text" autocomplete="organization"></label>
      <label>Adresa<input id="checkoutCompanyAddress" type="text" autocomplete="street-address"></label>
      <label>Kontaktní osoba *<input id="checkoutName" type="text" autocomplete="name"></label>
      <label class="email-field">E-mail *<span class="email-input-wrap email-insert-wrap"><input id="checkoutContact" type="email" autocomplete="email"><button type="button" class="email-at-button" data-insert-at="checkoutContact">@</button></span></label>
      <label>Telefon<input id="checkoutPhone" type="tel" autocomplete="tel"></label>
    `;

    const privateFields = `
      <label>Jméno a příjmení *<input id="checkoutName" type="text" autocomplete="name"></label>
      <label class="email-field">E-mail *<span class="email-input-wrap email-insert-wrap"><input id="checkoutContact" type="email" autocomplete="email"><button type="button" class="email-at-button" data-insert-at="checkoutContact">@</button></span></label>
      <label>Telefon<input id="checkoutPhone" type="tel" autocomplete="tel"></label>
    `;

    el.checkoutArea.innerHTML = `
      <div class="checkout-box">
        <div class="checkout-progress">
          <span>1 Typ zákazníka</span>
          <span class="active">2 Údaje</span>
          <span>3 Potvrzení</span>
        </div>
        <h3>Kontaktní údaje</h3>
        <div class="checkout-form">
          ${state.checkoutType === 'company' ? companyFields : privateFields}
        </div>
        <p class="checkout-note">Vyplňujeme jen minimum údajů. Platba i převzetí proběhne na prodejně.</p>
      </div>
    `;
    restoreCheckoutDraftIntoForm();
    return;
  }

  if (state.checkoutStep === 3) {
    el.exportOrder.textContent = 'Potvrdit objednávku';

    el.checkoutArea.innerHTML = `
      <div class="checkout-box">
        <div class="checkout-progress">
          <span>1 Typ zákazníka</span>
          <span>2 Údaje</span>
          <span class="active">3 Potvrzení</span>
        </div>
        <h3>Potvrzení objednávky</h3>
        <p class="checkout-confirm">
          Platba proběhne při převzetí na prodejně.<br>
          Převzetí je osobně ihned na prodejně podle aktuální skladové dostupnosti.
        </p>
        <p class="checkout-note">Po potvrzení předejte objednávku obsluze prodejny.</p>
      </div>
    `;
  }
}


function isValidEmail(value) {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeIc(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCzechIc(value) {
  const ic = normalizeIc(value);
  if (!/^\d{8}$/.test(ic)) return false;

  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    sum += Number(ic[i]) * (8 - i);
  }

  const mod = sum % 11;
  const check = mod === 0 ? 1 : mod === 1 ? 0 : 11 - mod;

  return check === Number(ic[7]);
}


function validateCheckoutForm() {
  let hasError = false;

  const requiredIds = state.checkoutType === 'company'
    ? ['checkoutIco', 'checkoutName', 'checkoutContact']
    : ['checkoutName', 'checkoutContact'];

  document.querySelectorAll('.checkout-form input').forEach(field => {
    field.classList.remove('checkout-field-error');
    field.closest('.email-input-wrap')?.classList.remove('checkout-field-error');
  });

  for (const id of requiredIds) {
    const field = document.getElementById(id);
    const value = String(field?.value || '').trim();

    let valid = value.length > 0;

    if (id === 'checkoutIco') {
      valid = value.length === 8 && isValidCzechIc(value);
    }

    if (id === 'checkoutContact') {
      valid = isValidEmail(value);
    }

    if (!valid) {
      field?.classList.add('checkout-field-error');
      field?.closest('.email-input-wrap')?.classList.add('checkout-field-error');
      hasError = true;
    }
  }

  if (hasError) {
    const firstError = document.querySelector('.checkout-form .checkout-field-error input, .checkout-form input.checkout-field-error');
    firstError?.focus();
    return false;
  }

  return true;
}

function finishCheckout() {
  alert('Objednávka je připravena. Předejte prosím obrazovku obsluze prodejny.');
  resetKioskSession();
}


function updateCheckoutButtons() {
  const clearBtn = document.getElementById('clearCart');
  const nextBtn = document.getElementById('exportOrder');
  if (!clearBtn || !nextBtn) return;

  let backBtn = document.getElementById('checkoutBack');

  if (state.checkoutStep > 0) {
    clearBtn.hidden = true;
    clearBtn.style.display = 'none';

    if (!backBtn) {
      backBtn = document.createElement('button');
      backBtn.id = 'checkoutBack';
      backBtn.className = 'secondary checkout-back';
      backBtn.type = 'button';
      backBtn.textContent = '← Zpět';
      nextBtn.parentNode.insertBefore(backBtn, nextBtn);

      backBtn.addEventListener('click', () => {
        state.checkoutStep = Math.max(0, state.checkoutStep - 1);
        renderCart();
        renderCheckout();
        updateCheckoutButtons();
      });
    }
  } else {
    clearBtn.hidden = false;
    clearBtn.style.display = '';
    if (backBtn) backBtn.remove();
  }
}

function exportOrder() {
  const order = {
    createdAt: new Date().toISOString(),
    source: 'verkon-kiosk-pilot-full-json',
    items: state.cart
  };
  const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kiosk-poptavka.json';
  link.click();
  URL.revokeObjectURL(url);
}

function saveCart() {
  localStorage.setItem('kioskCart', JSON.stringify(state.cart));
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem('kioskCart')) || []; }
  catch { return []; }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function tokenize(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function compact(value) {
  return normalize(value).replace(/\s+/g, '');
}



function getAvailableQty(product) {
  const qty = Number(product.available_qty ?? 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function clampQty(value, maxQty = Infinity) {
  const number = Number(value);
  const rounded = Number.isFinite(number) ? Math.round(number) : 1;
  const safeMax = Number.isFinite(Number(maxQty)) && Number(maxQty) > 0 ? Math.floor(Number(maxQty)) : 1;
  return Math.max(1, Math.min(rounded, safeMax));
}

function formatStock(product) {
  const qty = Number(product.available_qty ?? 0);

  if (Number.isFinite(qty) && qty > 0) {
    const unit = product.unit ? ` ${product.unit}` : '';
    return `Skladem: ${formatNumber(qty)}${unit}`;
  }

  return 'Na objednávku';
}

function formatNumber(value) {
  return new Intl.NumberFormat('cs-CZ', {
    maximumFractionDigits: 2
  }).format(value);
}

function formatPrice(value, currency) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Cena na dotaz';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(number) + ' bez DPH';
}

function getGroupLabel(id) {
  return GROUPS.find(group => group.id === id)?.label || 'Produkt';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function formatPriceWithVat(price, currency = 'CZK') {
  const number = Number(price);
  if (!Number.isFinite(number) || number <= 0) return '';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(number * 1.21);
}


// TODO: Checkout wizard (Firma/Soukromá osoba -> Kontaktní údaje -> Potvrzení)


// UX override: v krocích objednávky nezobrazovat seznam zboží
const _renderCheckoutOriginal = renderCheckout;
renderCheckout = function() {
  _renderCheckoutOriginal();
  if (!el?.cartItems) return;
  if (state.checkoutStep > 0) {
    el.cartItems.style.display = 'none';
  } else {
    el.cartItems.style.display = '';
  }
};




const _renderCheckoutForFooterOriginal = renderCheckout;
renderCheckout = function() {
  _renderCheckoutForFooterOriginal();
  updateCheckoutButtons();
};


document.addEventListener('input', (event) => {
  const field = event.target;
  if (!field) return;

  if (field.id === 'checkoutIco') {
    field.value = normalizeIc(field.value).slice(0, 8);
    const aresButton = document.getElementById('loadAres');
    const validIco = field.value.length === 8 && isValidCzechIc(field.value);
    field.classList.toggle('checkout-field-error', field.value.length === 8 && !validIco);
    if (aresButton) aresButton.disabled = !validIco;
  }

  if (field.id === 'checkoutContact') {
    const value = String(field.value || '').trim();
    field.classList.toggle('checkout-field-error', value.length > 3 && !isValidEmail(value));
  }
});


function buildAresAddress(sidlo) {
  if (!sidlo || typeof sidlo !== 'object') return '';

  if (sidlo.textovaAdresa) return String(sidlo.textovaAdresa);

  const parts = [
    sidlo.nazevUlice,
    sidlo.cisloDomovni ? String(sidlo.cisloDomovni) : '',
    sidlo.cisloOrientacni ? '/' + String(sidlo.cisloOrientacni) : '',
    sidlo.nazevObce,
    sidlo.psc ? String(sidlo.psc) : ''
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+\//g, '/').trim();
}

async function loadCompanyFromAres() {
  const icoField = document.getElementById('checkoutIco');
  const companyField = document.getElementById('checkoutCompany');
  const button = document.getElementById('loadAres');

  if (!icoField || !companyField || !button) return;

  const ico = normalizeIc(icoField.value);

  if (!isValidCzechIc(ico)) {
    icoField.classList.toggle('checkout-field-error', ico.length === 8);
    icoField.focus();
    return;
  }

  icoField.value = ico;

  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = 'Načítám z ARES…';

  try {
    const response = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${encodeURIComponent(ico)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 404) {
      alert('Subjekt s tímto IČ nebyl v ARES nalezen.');
      return;
    }

    if (!response.ok) {
      throw new Error('ARES HTTP ' + response.status);
    }

    const data = await response.json();

    companyField.value = data.obchodniJmeno || data.jmeno || '';
    companyField.dispatchEvent(new Event('input', { bubbles: true }));

    const address = buildAresAddress(data.sidlo);
    let addressField = document.getElementById('checkoutCompanyAddress');

    if (address && !addressField) {
      const wrapper = document.createElement('label');
      
      companyField.closest('label')?.insertAdjacentElement('afterend', wrapper);
      addressField = document.getElementById('checkoutCompanyAddress');
    }

    if (addressField && address) {
      addressField.value = address;
    }

  } catch (error) {
    console.error(error);
    alert('ARES se nepodařilo načíst. Zkontrolujte připojení k internetu nebo údaje doplňte ručně.');
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

document.addEventListener('click', (event) => {
  if (event.target && event.target.id === 'loadAres') {
    event.preventDefault();
    loadCompanyFromAres();
  }
});


function insertAtSignIntoEmailField(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const value = String(field.value || '');

  if (value.includes('@')) {
    field.focus();
    return;
  }

  field.value = value.slice(0, start) + '@' + value.slice(end);
  const nextPos = start + 1;
  field.focus();
  field.setSelectionRange(nextPos, nextPos);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-insert-at]');
  if (!button) return;
  event.preventDefault();
  insertAtSignIntoEmailField(button.dataset.insertAt);
});


function validateCheckoutFieldLive(field) {
  if (!field || !field.id) return;

  const value = String(field.value || '').trim();

  if (field.id === 'checkoutName') {
    field.classList.toggle('checkout-field-error', value.length === 0);
    field.classList.remove('checkout-field-valid');
    return;
  }

  if (field.id === 'checkoutContact') {
    const valid = typeof isValidEmail === 'function'
      ? isValidEmail(value)
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    field.classList.toggle('checkout-field-error', value.length > 0 && !valid);
    field.classList.remove('checkout-field-valid');
    return;
  }

  if (field.id === 'checkoutIco') {
    const ico = typeof normalizeIc === 'function' ? normalizeIc(value) : value.replace(/\D/g, '');
    const valid = typeof isValidCzechIc === 'function' ? isValidCzechIc(ico) : ico.length === 8;
    const aresButton = document.getElementById('loadAres');

    field.value = ico.slice(0, 8);

    field.classList.toggle('checkout-field-error', ico.length === 8 && !valid);
    field.classList.remove('checkout-field-valid');

    if (aresButton) {
      aresButton.disabled = !(ico.length === 8 && valid);
    }
    return;
  }

  if (field.id === 'checkoutCompany' || field.id === 'checkoutCompanyAddress' || field.id === 'checkoutPhone') {
    field.classList.remove('checkout-field-error');
    field.classList.remove('checkout-field-valid');
  }
}

document.addEventListener('input', (event) => {
  const field = event.target;
  if (!field || !field.matches?.('.checkout-form input')) return;
  validateCheckoutFieldLive(field);
});

document.addEventListener('blur', (event) => {
  const field = event.target;
  if (!field || !field.matches?.('.checkout-form input')) return;
  validateCheckoutFieldLive(field);
}, true);


/* UX: odstraneni zeleneho stavu */
document.addEventListener('input', (event) => {
  const f = event.target;
  if (f && f.classList) {
    f.classList.remove('checkout-field-valid');
  }
}, true);


function updateAresButtonState() {
  const icoField = document.getElementById('checkoutIco');
  const aresButton = document.getElementById('loadAres');
  if (!icoField || !aresButton) return;

  const ico = normalizeIc(icoField.value);
  aresButton.disabled = !(ico.length === 8 && isValidCzechIc(ico));
}


const _renderCheckoutForAresButtonOriginal = renderCheckout;
renderCheckout = function() {
  _renderCheckoutForAresButtonOriginal();
  updateAresButtonState();
};


function clearEmailWrapperValidation(field) {
  if (!field || field.id !== 'checkoutContact') return;
  const wrapper = field.closest('.email-input-wrap');
  if (!wrapper) return;

  const value = String(field.value || '').trim();
  if (value && isValidEmail(value)) {
    wrapper.classList.remove('checkout-field-error');
    field.classList.remove('checkout-field-error');
  }
}

document.addEventListener('input', (event) => {
  clearEmailWrapperValidation(event.target);
}, true);


const CHECKOUT_DRAFT_KEY = 'kioskCheckoutDraft';
let idleWarningTimer = null;
let idleResetTimer = null;

function loadCheckoutDraft() {
  try {
    return JSON.parse(localStorage.getItem(CHECKOUT_DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCheckoutDraft() {
  localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(state.checkoutDraft || {}));
}

function clearCheckoutDraft() {
  state.checkoutDraft = {};
  localStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function saveCheckoutDraftFromForm() {
  const draft = {
    ...(state.checkoutDraft || {}),
    checkoutType: state.checkoutType || 'private'
  };

  const fields = {
    checkoutIco: 'ico',
    checkoutCompany: 'company',
    checkoutCompanyAddress: 'address',
    checkoutName: 'name',
    checkoutContact: 'email',
    checkoutPhone: 'phone'
  };

  Object.entries(fields).forEach(([id, key]) => {
    const field = document.getElementById(id);
    if (field) draft[key] = field.value || '';
  });

  const selected = document.querySelector('input[name="customerType"]:checked');
  if (selected) draft.checkoutType = selected.value;

  state.checkoutDraft = draft;
  saveCheckoutDraft();
}

function restoreCheckoutDraft() {
  const draft = state.checkoutDraft || {};
  if (draft.checkoutType) {
    state.checkoutType = draft.checkoutType;
  }
}

function restoreCheckoutDraftIntoForm() {
  const draft = state.checkoutDraft || {};

  const fields = {
    checkoutIco: draft.ico,
    checkoutCompany: draft.company,
    checkoutCompanyAddress: draft.address,
    checkoutName: draft.name,
    checkoutContact: draft.email,
    checkoutPhone: draft.phone
  };

  Object.entries(fields).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field && value !== undefined) {
      field.value = value;
      if (typeof validateCheckoutFieldLive === 'function') {
        validateCheckoutFieldLive(field);
      }
    }
  });
}

function hasActiveKioskSession() {
  return Boolean(
    state.cart.length ||
    state.checkoutStep > 0 ||
    state.query ||
    state.detailOpen ||
    Object.keys(state.checkoutDraft || {}).some(key => String(state.checkoutDraft[key] || '').trim())
  );
}

function installIdleWatcher() {
  const events = ['pointerdown', 'keydown', 'touchstart', 'input'];
  events.forEach(eventName => {
    document.addEventListener(eventName, () => {
      if (el.idleModal && !el.idleModal.hidden) return;
      resetIdleTimers();
    }, { passive: true });
  });

  resetIdleTimers();
}

function resetIdleTimers() {
  clearTimeout(idleWarningTimer);
  clearTimeout(idleResetTimer);

  const warningMs = Math.max(10, Number(APP_CONFIG.idleWarningSeconds || 90)) * 1000;

  idleWarningTimer = setTimeout(() => {
    if (hasActiveKioskSession()) {
      showIdleWarning();
    } else {
      resetIdleTimers();
    }
  }, warningMs);
}

function showIdleWarning() {
  if (!el.idleModal) return;

  el.idleModal.hidden = false;

  clearTimeout(idleResetTimer);
  const resetMs = Math.max(5, Number(APP_CONFIG.idleResetSeconds || 30)) * 1000;
  idleResetTimer = setTimeout(() => {
    resetKioskSession();
  }, resetMs);
}

function hideIdleWarning() {
  if (el.idleModal) el.idleModal.hidden = true;
  clearTimeout(idleResetTimer);
}

function resetKioskSession() {
  hideIdleWarning();

  state.cart = [];
  state.query = '';
  state.selectedId = null;
  state.detailOpen = false;
  state.checkoutStep = 0;
  state.checkoutType = 'private';
  state.activeDynamicGroup = 'all';

  clearCheckoutDraft();
  saveCart();

  if (el.searchInput) el.searchInput.value = '';
  closeDetail();
  closeCart();

  render();
  renderCart();
  renderCheckout();
  renderCartCount();
  updateCheckoutButtons?.();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  resetIdleTimers();
}


function pulseCartButton() {
  if (!el.cartButton) return;
  el.cartButton.classList.remove('cart-pulse');
  void el.cartButton.offsetWidth;
  el.cartButton.classList.add('cart-pulse');
}
