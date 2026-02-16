/**
 * @file update_master.js
 * @description シリーズ別最大IDの抽出、ソース別参照、および出力フォーマットの最適化（一行化）を行う。
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = 'data';
const FILES = {
    OPTION_TSV: path.join(DATA_DIR, 'GatyaData_Option_SetE.tsv'),
    POOL_E1: path.join(DATA_DIR, 'GatyaDataSetE1.csv'),
    POOL_E3: path.join(DATA_DIR, 'GatyaDataSetE3.csv'),
    ITEM_BUY: path.join(DATA_DIR, 'Gatyaitembuy.csv'),
    GATYA_TSV: path.join(DATA_DIR, 'gatya.tsv'),
    SERIES_JS: path.join(DATA_DIR, 'gacha_series.js'),
    CATS_JS: path.join(DATA_DIR, 'cats.js')
};

const ignoreKeywords = ["にゃんこガチャ", "福引", "レアガチャ", "プラチナガチャ", "レジェンドガチャ"];

function parseJsData(rawString, startChar, endChar) {
    const start = rawString.indexOf(startChar);
    const end = rawString.lastIndexOf(endChar);
    if (start === -1 || end === -1) return null;
    const jsonLike = rawString.substring(start, end + 1);
    try { return eval(`(${jsonLike})`); } catch (e) { return null; }
}

/**
 * 特定のキーや構造を一行にまとめるカスタム文字列化関数
 */
function customStringify(obj) {
    let str = JSON.stringify(obj, null, 4);

    // 1. rarityRates の一行化
    str = str.replace(/"rarityRates":\s*\{([\s\S]+?)\}/g, (match, p1) => {
        const content = p1.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        return `"rarityRates": { ${content} }`;
    });

    // 2. pool の一行化
    str = str.replace(/"pool":\s*\[([\s\S]+?)\]/g, (match, p1) => {
        const content = p1.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
        const spaced = content.split(',').map(s => s.trim()).join(', ');
        return `"pool": [ ${spaced} ]`;
    });

    // 3. itemMaster 内のアイテムオブジェクトの一行化
    // パターン: { "name": "...", "rarity": ... }
    str = str.replace(/\{\s*\n\s+"name":\s*("(?:[^"\\]|\\.)*")\s*,\s*\n\s+"rarity":\s*(\d+)\n\s+\}/g, '{ "name": $1, "rarity": $2 }');

    return str;
}

function generateMaster() {
    console.log("論理フィルタリングと記述スタイルの最適化を開始します...");

    try {
        const tsvContent = fs.readFileSync(FILES.OPTION_TSV, 'utf-8');
        const gatyaTsvContent = fs.readFileSync(FILES.GATYA_TSV, 'utf-8');
        const e1Content = fs.readFileSync(FILES.POOL_E1, 'utf-8');
        const e3Content = fs.readFileSync(FILES.POOL_E3, 'utf-8');
        const itemBuyContent = fs.readFileSync(FILES.ITEM_BUY, 'utf-8');
        const seriesJsRaw = fs.readFileSync(FILES.SERIES_JS, 'utf-8');
        const catsJsRaw = fs.readFileSync(FILES.CATS_JS, 'utf-8');
        
        const gachaSeriesMaster = parseJsData(seriesJsRaw, '{', '}');
        const catsData = parseJsData(catsJsRaw, '[', ']');
        
        if (!gachaSeriesMaster || !catsData) throw new Error("JSデータのパースに失敗しました。");

        const catsMap = {};
        catsData.forEach(c => { catsMap[c.id] = { name: c.name, rarity: c.rarity }; });

        const itemBuyMap = {};
        const itemLines = itemBuyContent.split(/\r?\n/).filter(l => l && !l.startsWith('[source'));
        const itemHeaders = itemLines[0].split(',');
        const itemIdIdx = itemHeaders.indexOf('stageDropItemID');
        const itemRarityIdx = itemHeaders.indexOf('Rarity');
        const itemCommentIdx = itemHeaders.indexOf('comment');

        itemLines.slice(1).forEach(line => {
            const cols = line.split(',');
            const id = parseInt(cols[itemIdIdx]);
            if (!isNaN(id) && id !== -1) {
                itemBuyMap[id] = {
                    name: cols[itemCommentIdx] ? cols[itemCommentIdx].replace(/ガチャ排出用：|アイテムショップ：/g, "") : "Unknown",
                    rarity: parseInt(cols[itemRarityIdx]) || 0
                };
            }
        });

        const ticketOverrideLookup = {};
        gatyaTsvContent.split(/\r?\n/).forEach(line => {
            const cols = line.split('\t');
            if (cols.length < 25) return;
            for (let start = 10; start + 14 < cols.length; start += 15) {
                const block = cols.slice(start, start + 15);
                if (ignoreKeywords.some(key => (block[14] || "").includes(key))) continue;
                ticketOverrideLookup[block[1]] = {
                    rates: { "0": parseInt(block[4]), "1": parseInt(block[6]), "2": parseInt(block[8]), "3": parseInt(block[10]), "4": parseInt(block[12]) },
                    ug: block[11] === "1", lg: block[13] === "1"
                };
            }
        });

        const setInfoLookup = {};
        const tsvLines = tsvContent.split(/\r?\n/).filter(l => l && !l.startsWith('[source'));
        const tsvHeaders = tsvLines[0].split('\t');
        tsvLines.slice(1).forEach(line => {
            const cols = line.split('\t');
            if (cols.length > 1) setInfoLookup[cols[tsvHeaders.indexOf('GatyaSetID')]] = { ticketId: cols[tsvHeaders.indexOf('ItemID_Ticket')], seriesId: cols[tsvHeaders.indexOf('seriesID')] };
        });

        const parsePool = (c) => c.split(/\r?\n/).filter(l => l && !l.startsWith('[source')).map(l => l.split(',').map(v => parseInt(v)).filter(v => !isNaN(v) && v !== -1));
        const poolE1 = parsePool(e1Content);
        const poolE3 = parsePool(e3Content);

        const gachaMaster = {};
        const finalItemMaster = {};
        const usedE1Ids = new Set();
        const usedE3Ids = new Set();

        Object.keys(gachaSeriesMaster).forEach(sid => {
            const series = gachaSeriesMaster[sid];
            if (sid === "0" || !series.gachaIds || series.gachaIds.length === 0) return;

            const targetGid = Math.max(...series.gachaIds);
            const info = setInfoLookup[targetGid];
            if (!info) return;

            const override = ticketOverrideLookup[info.ticketId];
            const rates = override ? override.rates : (series.rarityRates || { "0": 800, "1": 5000, "2": 3000, "3": 1000, "4": 200 });
            
            const idsE1 = poolE1[targetGid] || [];
            const idsE3 = poolE3[targetGid] || [];
            idsE1.forEach(id => usedE1Ids.add(id));
            idsE3.forEach(id => usedE3Ids.add(id));

            gachaMaster[targetGid] = {
                name: series.name,
                featuredItemRate: series.featuredItemRate || 0,
                featuredItemStock: series.featuredItemStock || 0,
                guaranteedCycle: series.guaranteedCycle || 10,
                uberGuaranteedFlag: override ? override.ug : (series.uberGuaranteedFlag ?? true),
                legendGuaranteedFlag: override ? override.lg : (series.legendGuaranteedFlag ?? false),
                rarityRates: rates,
                pool: [...idsE3, ...idsE1]
            };
        });

        usedE1Ids.forEach(id => { if (catsMap[id]) finalItemMaster[id] = catsMap[id]; });
        usedE3Ids.forEach(id => { if (itemBuyMap[id]) finalItemMaster[id] = itemBuyMap[id]; });

        // 最適化された文字列化を適用
        const gachaMasterStr = customStringify(gachaMaster);
        const itemMasterStr = customStringify(finalItemMaster);

        const output = `/**\n * 生成日時: ${new Date().toLocaleString()}\n */\n\nconst gachaMaster = ${gachaMasterStr};\n\nconst itemMaster = ${itemMasterStr};\n\nif (typeof module !== 'undefined') { module.exports = { gachaMaster, itemMaster }; }`;
        
        fs.writeFileSync('master.js', output);
        console.log(`成功: master.js を一行化フォーマットで更新しました。`);

    } catch (err) {
        console.error("生成失敗:", err.message);
    }
}

generateMaster();