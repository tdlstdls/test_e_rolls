/**
 * 担当: アプリケーションの起動、URLパラメータ管理、DOMイベントリスナーの制御
 * 改修内容: LastRollの選択肢を現在のガチャの出現アイテム（プール）に限定して表示するよう変更。
 */

// --- グローバル変数 ---
const DEFAULT_PARAMS = {
    gacha: '45',
    seed: '12345',
    ng: 'none',
    fs: 'none',
    lr: 'none',
    comp: false,
    tx: false,
    roll: 100,
    displaySeed: '0',
    displaySim: '0' 
};
let currentHighlightMode = 'all'; 
let activeGachaId;
let forceRerollMode = false;

window.activeGachaId = activeGachaId;
window.forceRerollMode = forceRerollMode;

/**
 * シミュレーション実行および表示のメインディスパッチャー
 */
function runSimulationAndDisplay(options = {}) {
    const { hideSeedInput = false, uiOverrides = {} } = options;
    const params = new URLSearchParams(window.location.search);
    
    // 最新のガチャIDを取得
    const gachaIds = Object.keys(gachaMaster).map(Number);
    const latestGachaId = Math.max(...gachaIds).toString();

    // 現在のパラメータを取得、未設定ならデフォルトを適用
    const p = {};
    ['gacha', 'seed', 'ng', 'fs', 'lr', 'comp', 'tx', 'roll', 'displaySeed', 'displaySim'].forEach(k => {
        p[k] = params.get(k);
    });

    // UI操作による上書き設定
    if (uiOverrides.gacha !== undefined) p.gacha = uiOverrides.gacha;
    if (uiOverrides.seed !== undefined) p.seed = uiOverrides.seed;
    if (uiOverrides.guaranteedRolls !== undefined) p.ng = uiOverrides.guaranteedRolls;
    if (uiOverrides.featuredStock !== undefined) p.fs = uiOverrides.featuredStock;
    if (uiOverrides.lr !== undefined) p.lr = uiOverrides.lr;
    if (uiOverrides.isComplete !== undefined) p.comp = uiOverrides.isComplete ? 'true' : 'false';
    if (uiOverrides.displaySeed !== undefined) p.displaySeed = uiOverrides.displaySeed;
    if (uiOverrides.displaySim !== undefined) p.displaySim = uiOverrides.displaySim;

    if (!p.gacha || !gachaMaster[p.gacha]) p.gacha = latestGachaId;
    if (!p.seed) p.seed = DEFAULT_PARAMS.seed;
    if (!p.roll) p.roll = DEFAULT_PARAMS.roll;
    if (!p.ng) p.ng = DEFAULT_PARAMS.ng;
    if (!p.lr) p.lr = DEFAULT_PARAMS.lr;
    if (!p.displaySeed) p.displaySeed = DEFAULT_PARAMS.displaySeed;
    if (!p.displaySim) p.displaySim = DEFAULT_PARAMS.displaySim;
    
    activeGachaId = p.gacha;
    window.activeGachaId = activeGachaId;
    const gacha = gachaMaster[p.gacha];

    // ガチャ選択UIおよびSEED表示の同期
    const gachaDisplay = document.getElementById('gachaNameDisplay');
    const gachaSelect = document.getElementById('gachaSelect');
    const copySeedDisplayLink = document.getElementById('copySeedDisplayLink');
    
    if (gachaDisplay) gachaDisplay.textContent = `${p.gacha} ${gacha.name}`;
    if (gachaSelect) gachaSelect.value = p.gacha;
    if (copySeedDisplayLink) copySeedDisplayLink.textContent = `SEED:${p.seed}`;

    // 「次の確定」表示の同期
    const guaranteedDisplay = document.getElementById('guaranteedDisplay');
    const guaranteedInput = document.getElementById('guaranteedRollsInput');
    if (guaranteedDisplay) {
        const displayText = (p.ng === 'none' || !p.ng) ? '-' : p.ng;
        guaranteedDisplay.textContent = `次の確定：${displayText}`;
    }
    if (guaranteedInput) {
        guaranteedInput.value = p.ng;
    }

    // 「LastRoll」表示の同期（ここで選択肢を現在のガチャに限定して再構築）
    populateLastRollInput(p.gacha);
    const lastRollDisplay = document.getElementById('lastRollDisplay');
    const lastRollInput = document.getElementById('lastRollInput');
    if (lastRollDisplay) {
        const itemName = (p.lr !== 'none' && itemMaster[p.lr]) ? itemMaster[p.lr].name : '-';
        lastRollDisplay.textContent = `LastRoll: ${itemName}`;
    }
    if (lastRollInput) {
        lastRollInput.value = p.lr;
    }
    
    // シミュレーション表示設定の反映
    const simContainer = document.getElementById('sim-ui-container');
    const toggleSimBtn = document.getElementById('toggleSimBtn');
    if (p.displaySim === '1') {
        simContainer.style.display = 'block';
        toggleSimBtn.textContent = 'シミュレーションを非表示';
        if (typeof initializeSimulationView === 'function') {
            initializeSimulationView(gacha);
        }
    } else {
        simContainer.style.display = 'none';
        toggleSimBtn.textContent = 'シミュレーションを表示';
    }

    // 入力フォームへの反映
    const seedInput = document.getElementById('seedInput');
    if (seedInput) seedInput.value = p.seed;
    
    const isComplete = (p.comp === 'true');
    const compCheckbox = document.getElementById('featuredCompleteCheckbox');
    if (compCheckbox) compCheckbox.checked = isComplete;
    
    // ガチャ設定に応じた目玉・確定枠の表示制御
    if (gacha.featuredItemStock === 0) {
        if (compCheckbox) {
            compCheckbox.checked = true;
            compCheckbox.parentElement.classList.add('hidden-control');
        }
    } else {
        if (compCheckbox) compCheckbox.parentElement.classList.remove('hidden-control');
    }
    
    const isComp = compCheckbox ? compCheckbox.checked : false;
    const stockControl = document.getElementById('stockControl');
    const guaranteedControl = document.getElementById('guaranteedControl');
    const legendDisplay = document.getElementById('legendDisplay');
    const legendCommon = document.getElementById('legendCommon');

    populateFeaturedStockInput(p.gacha, p.fs);
    if (isComp) {
        if (stockControl) stockControl.classList.add('hidden-control');
        if (gacha.uberGuaranteedFlag || gacha.legendGuaranteedFlag) {
            if (guaranteedControl) guaranteedControl.classList.remove('hidden-control');
            if (legendDisplay) legendDisplay.classList.remove('hidden-control');
            populateGuaranteedRolls(10, p.ng);
        } else {
            if (guaranteedControl) guaranteedControl.classList.add('hidden-control');
            if (legendDisplay) legendDisplay.classList.add('hidden-control');
        }
        if (legendCommon) legendCommon.style.display = 'inline-block';
    } else {
        if (stockControl) stockControl.classList.remove('hidden-control');
        if (guaranteedControl) guaranteedControl.classList.remove('hidden-control');
        if (legendDisplay) legendDisplay.classList.remove('hidden-control');
        populateGuaranteedRolls(gacha.guaranteedCycle || 30, p.ng);
        if (legendCommon) legendCommon.style.display = 'none';
    }

    // SEED表示トグルボタンのテキスト更新
    const toggleSeedBtn = document.getElementById('toggleSeedBtn');
    if (toggleSeedBtn) {
        toggleSeedBtn.textContent = (p.displaySeed === '1') ? 'SEEDを非表示' : 'SEEDを表示';
    }

    // ブラウザのURL履歴を更新
    const newParams = {
        gacha: p.gacha, seed: p.seed, ng: p.ng, fs: p.fs, lr: p.lr === 'none' ? null : p.lr,
        comp: isComp ? 'true' : 'false',
        tx: p.tx === '1' ? '1' : '0',
        roll: p.roll, displaySeed: p.displaySeed, displaySim: p.displaySim
    };
    const newQuery = generateUrlQuery(newParams);
    window.history.replaceState({ path: newQuery }, '', `${window.location.pathname}${newQuery}`);

    // 各種ビュー（テーブル描画）の実行
    const seedValue = parseInt(p.seed, 10);
    const lastRollId = (p.lr && p.lr !== 'none') ? parseInt(p.lr, 10) : null;
    const rows = parseInt(p.roll, 10);
    const thresholds = {
        '0': gacha.rarityRates['0'],
        '1': gacha.rarityRates['0'] + gacha.rarityRates['1'],
        '2': gacha.rarityRates['0'] + gacha.rarityRates['1'] + gacha.rarityRates['2'],
        '3': gacha.rarityRates['0'] + gacha.rarityRates['1'] + gacha.rarityRates['2'] + gacha.rarityRates['3'],
        '4': 10000
    };
    if (isComp) {
        createAndDisplayCompletedSeedView(seedValue, gacha, rows, thresholds, lastRollId, p.displaySeed, new URLSearchParams(newQuery), p.ng);
    } else {
        createAndDisplayUncompletedSeedView(seedValue, gacha, rows, thresholds, lastRollId, p.displaySeed, new URLSearchParams(newQuery));
    }
}

/**
 * 確定枠セレクトボックスの生成
 */
function populateGuaranteedRolls(max, currentVal) {
    const input = document.getElementById('guaranteedRollsInput');
    if (!input) return;
    input.innerHTML = '';
    const unsetOption = document.createElement('option');
    unsetOption.value = 'none'; unsetOption.textContent = '未設定'; input.appendChild(unsetOption);
    for (let i = 1; i <= max; i++) {
        const option = document.createElement('option');
        option.value = i; option.textContent = i; input.appendChild(option);
    }
    if (currentVal && input.querySelector(`option[value="${currentVal}"]`)) {
        input.value = currentVal;
    } else {
        input.value = 'none';
    }
}

/**
 * 目玉在庫数セレクトボックスの生成
 */
function populateFeaturedStockInput(gachaId, preferredValue) {
    const gacha = gachaMaster[gachaId];
    const input = document.getElementById('featuredStockInput');
    if (!gacha || !input) return;
    input.innerHTML = '';
    const unsetOption = document.createElement('option');
    unsetOption.value = 'none'; unsetOption.textContent = '-'; input.appendChild(unsetOption);
    for (let i = 1; i <= gacha.featuredItemStock; i++) {
        const option = document.createElement('option');
        option.value = i; option.textContent = i; input.appendChild(option);
    }
    if (preferredValue && preferredValue !== 'none' && input.querySelector(`option[value="${preferredValue}"]`)) {
        input.value = preferredValue;
    } else {
        input.value = 'none';
    }
}

/**
 * 直前アイテム（LastRoll）セレクトボックスの生成
 * 現在選択されているガチャのプールに含まれるアイテムのみを表示
 */
function populateLastRollInput(gachaId) {
    const input = document.getElementById('lastRollInput');
    if (!input || !itemMaster || !gachaMaster[gachaId]) return;
    
    // 現在のガチャの出現アイテムIDをSetとして保持（高速検索用）
    const gachaPool = new Set(gachaMaster[gachaId].pool);
    
    input.innerHTML = '';
    const unsetOption = document.createElement('option');
    unsetOption.value = 'none'; unsetOption.textContent = '未設定'; input.appendChild(unsetOption);
    
    // アイテムID順にソートし、プールに含まれるものだけを追加
    Object.keys(itemMaster).map(Number).sort((a, b) => a - b).forEach(id => {
        if (gachaPool.has(id)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${id} ${itemMaster[id].name}`;
            input.appendChild(option);
        }
    });
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', async () => {
    const loadSuccess = await DataLoader.init();
    if (!loadSuccess) {
        alert("データのロードに失敗しました。サーバーまたはファイルの状態を確認してください。");
        return;
    }

    setupGachaRarityItems();

    // ガチャ選択セレクトボックスの生成
    const gachaSelect = document.getElementById('gachaSelect');
    if (gachaSelect) {
        gachaSelect.innerHTML = '';
        const excludeList = ["モンハン", "ねばーる君", "ねば～る君", "にゃんこ競馬", "はてなボックス"];
        Object.keys(gachaMaster).map(Number).sort((a, b) => b - a).forEach(id => {
            const gachaName = gachaMaster[id].name;
            if (excludeList.some(ex => gachaName.includes(ex))) return;
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${id} ${gachaName}`;
            gachaSelect.appendChild(option);
        });
        gachaSelect.addEventListener('change', (e) => {
            runSimulationAndDisplay({ uiOverrides: { gacha: e.target.value } });
        });
    }

    // LastRollセレクトボックスの変更イベント
    const lastRollInput = document.getElementById('lastRollInput');
    if (lastRollInput) {
        lastRollInput.addEventListener('change', (e) => {
            runSimulationAndDisplay({ uiOverrides: { lr: e.target.value } });
        });
    }

    // SEED表示クリック時のコピーイベント
    const copySeedDisplayLink = document.getElementById('copySeedDisplayLink');
    if (copySeedDisplayLink) {
        copySeedDisplayLink.addEventListener('click', (e) => {
            e.preventDefault();
            const seedValue = new URLSearchParams(window.location.search).get('seed');
            if (seedValue && navigator.clipboard) {
                navigator.clipboard.writeText(seedValue).then(() => {
                    const originalText = copySeedDisplayLink.textContent;
                    copySeedDisplayLink.textContent = 'Copied!';
                    setTimeout(() => { copySeedDisplayLink.textContent = `SEED:${seedValue}`; }, 1500);
                });
            }
        });
    }

    // SEED値更新（インライン編集）の制御
    const showSeedInputLink = document.getElementById('showSeedInputLink');
    const seedInput = document.getElementById('seedInput');
    const seedTooltip = document.getElementById('seedTooltip');
    if (showSeedInputLink && seedInput) {
        showSeedInputLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSeedInputLink.style.display = 'none';
            seedInput.style.display = 'inline-block';
            seedInput.focus();
            if (seedTooltip) {
                seedTooltip.style.display = 'block';
                setTimeout(() => { seedTooltip.style.display = 'none'; }, 3000);
            }
        });
        seedInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                runSimulationAndDisplay({ uiOverrides: { seed: seedInput.value } });
                seedInput.style.display = 'none';
                showSeedInputLink.style.display = 'inline-block';
            }
        });
    }
    
    // 確定枠変更イベント
    const guaranteedInput = document.getElementById('guaranteedRollsInput');
    if (guaranteedInput) {
        guaranteedInput.addEventListener('change', (e) => {
            runSimulationAndDisplay({ uiOverrides: { guaranteedRolls: e.target.value } });
        });
    }

    // その他のUI要素のイベント紐付け
    const featuredStockInput = document.getElementById('featuredStockInput');
    if (featuredStockInput) {
        featuredStockInput.addEventListener('change', (e) => {
            runSimulationAndDisplay({ uiOverrides: { featuredStock: e.target.value } });
        });
    }
    
    const featuredCompleteCheckbox = document.getElementById('featuredCompleteCheckbox');
    if (featuredCompleteCheckbox) {
        featuredCompleteCheckbox.addEventListener('change', () => {
            runSimulationAndDisplay({ uiOverrides: { isComplete: featuredCompleteCheckbox.checked } });
        });
    }
    
    document.getElementById('toggleSeedBtn').addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const current = params.get('displaySeed') === '1' ? '0' : '1';
        runSimulationAndDisplay({ uiOverrides: { displaySeed: current } });
    });
    document.getElementById('toggleSimBtn').addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const current = params.get('displaySim') === '1' ? '0' : '1';
        runSimulationAndDisplay({ uiOverrides: { displaySim: current } });
    });
    
    document.getElementById('result-table-container').addEventListener('click', (event) => {
        if (event.target.id === 'forceRerollToggle') {
            window.forceRerollMode = !window.forceRerollMode;
            runSimulationAndDisplay();
        }
    });

    const applyHighlightMode = () => {
         const table = document.querySelector('#result-table-container table');
         if (!table) return;
         table.classList.remove('mode-single', 'mode-multi');
         if (currentHighlightMode === 'single') table.classList.add('mode-single');
         if (currentHighlightMode === 'multi') table.classList.add('mode-multi');
    };
    document.getElementById('legendSingle').addEventListener('click', () => {
        if (featuredCompleteCheckbox && featuredCompleteCheckbox.checked) {
            currentHighlightMode = (currentHighlightMode === 'single') ? 'all' : 'single';
            applyHighlightMode();
        }
    });
    document.getElementById('legendMulti').addEventListener('click', () => {
        if (featuredCompleteCheckbox && featuredCompleteCheckbox.checked) {
            currentHighlightMode = (currentHighlightMode === 'multi') ? 'all' : 'multi';
            applyHighlightMode();
        }
    });

    // 初期化時は runSimulationAndDisplay 内で populateLastRollInput も呼ばれる
    runSimulationAndDisplay();
});