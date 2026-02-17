/**
 * @file data-loader.js
 * @description data/ フォルダ内の生データを直接 fetch し、実行時に gachaMaster と itemMaster を動的に構築する。
 * update_master.js のロジックをブラウザ向けに移植。
 */

const DataLoader = (function() {
    const DATA_DIR = 'data';
    const FILES = {
        OPTION_TSV: `${DATA_DIR}/GatyaData_Option_SetE.tsv`,
        POOL_E1: `${DATA_DIR}/GatyaDataSetE1.csv`,
        POOL_E3: `${DATA_DIR}/GatyaDataSetE3.csv`,
        ITEM_BUY: `${DATA_DIR}/Gatyaitembuy.csv`,
        GATYA_TSV: `${DATA_DIR}/gatya.tsv`,
        SERIES_JS: `${DATA_DIR}/gacha_series.js`,
        CATS_JS: `${DATA_DIR}/cats.js`
    };

    const ignoreKeywords = ["にゃんこガチャ", "福引", "レアガチャ", "プラチナガチャ", "レジェンドガチャ"];

    const itemNameAbbreviations = {
        0: "スピダ", 1: "トレレ", 2: "ネコボン", 3: "ニャンピュ", 4: "おかめ",
        5: "スニャ", 10: "5千XP", 11: "1万XP", 12: "3万XP", 14: "10万XP",
        18: "200万XP", 159: "5千XP", 197: "100万XP", 222: "2千XP", 223: "25000XP"
    };

    /**
     * JSファイルの文字列からオブジェクト/配列を抽出
     */
    function parseJsData(rawString, startChar, endChar) {
        const start = rawString.indexOf(startChar);
        const end = rawString.lastIndexOf(endChar);
        if (start === -1 || end === -1) return null;
        const jsonLike = rawString.substring(start, end + 1);
        try {
            // 安全な範囲で eval 的な処理を行いオブジェクトを復元
            return new Function(`return ${jsonLike}`)();
        } catch (e) {
            console.error("JSパース失敗:", e);
            return null;
        }
    }

    /**
     * メインのロード処理
     */
    async function load() {
        console.log("外部データの動的ロードを開始します...");

        try {
            const fetchText = url => fetch(url).then(r => {
                if (!r.ok) throw new Error(`Fetch failed: ${url}`);
                return r.text();
            });

            // 全ファイルを並列取得
            const [tsv, gatyaTsv, e1, e3, itemBuy, seriesJs, catsJs] = await Promise.all([
                fetchText(FILES.OPTION_TSV),
                fetchText(FILES.GATYA_TSV),
                fetchText(FILES.POOL_E1),
                fetchText(FILES.POOL_E3),
                fetchText(FILES.ITEM_BUY),
                fetchText(FILES.SERIES_JS),
                fetchText(FILES.CATS_JS)
            ]);

            const gachaSeriesMaster = parseJsData(seriesJs, '{', '}');
            const catsData = parseJsData(catsJs, '[', ']');

            if (!gachaSeriesMaster || !catsData) throw new Error("JSデータの構造解析に失敗しました。");

            // マップ作成
            const catsMap = {};
            catsData.forEach(c => { catsMap[c.id] = { name: c.name, rarity: c.rarity }; });

            const itemBuyMap = {};
            const itemLines = itemBuy.split(/\r?\n/).filter(l => l && !l.startsWith('[source'));
            for (let i = 1; i < itemLines.length; i++) {
                const cols = itemLines[i].split(',');
                if (cols.length < 2) continue;
                const id = i - 1;
                const rarity = parseInt(cols[0]);
                let name = (cols[cols.length - 1] || "Unknown").replace(/ガチャ排出用：|アイテムショップ：/g, "").trim();
                if (itemNameAbbreviations[id] !== undefined) name = itemNameAbbreviations[id];
                itemBuyMap[id] = { name: name, rarity: isNaN(rarity) ? 0 : rarity };
            }

            const ticketOverrideLookup = {};
            gatyaTsv.split(/\r?\n/).forEach(line => {
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
            const tsvLines = tsv.split(/\r?\n/).filter(l => l && !l.startsWith('[source'));
            const tsvHeaders = tsvLines[0].split('\t');
            tsvLines.slice(1).forEach(line => {
                const cols = line.split('\t');
                if (cols.length > 1) {
                    setInfoLookup[cols[tsvHeaders.indexOf('GatyaSetID')]] = {
                        ticketId: cols[tsvHeaders.indexOf('ItemID_Ticket')],
                        seriesId: cols[tsvHeaders.indexOf('seriesID')]
                    };
                }
            });

            const parsePool = (c) => c.split(/\r?\n/).filter(l => l && !l.startsWith('[source')).map(l => l.split(',').map(v => parseInt(v)).filter(v => !isNaN(v) && v !== -1));
            const poolE1 = parsePool(e1);
            const poolE3 = parsePool(e3);

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

            usedE1Ids.forEach(id => {
                if (catsMap[id]) {
                    let assignedRarity = 3; // 超激レア
                    if (id === 557 || id === 474) assignedRarity = 4; // 伝説レア
                    finalItemMaster[id] = { name: catsMap[id].name, rarity: assignedRarity };
                }
            });

            usedE3Ids.forEach(id => {
                if (itemBuyMap[id]) finalItemMaster[id] = itemBuyMap[id];
            });

            // グローバル変数に書き出し（既存コードとの互換性）
            window.gachaMaster = gachaMaster;
            window.itemMaster = finalItemMaster;

            console.log("マスタデータの構築が完了しました。");
            return true;

        } catch (err) {
            console.error("データのロードに失敗しました:", err);
            return false;
        }
    }

    return { init: load };
})();