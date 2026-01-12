/**
 * token-fetcher.js
 * Fetches all available tokens from Hyperliquid (Main Exchange + External DEXs)
 * and resolves Spot asset names (e.g., changes "@1" to "HYPE").
 */

async function getAllHyperliquidTokens() {
    try {
        // 1. Fetch DEX list and Spot Metadata in parallel
        const [infoResponse, spotMetaResponse] = await Promise.all([
            fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'perpDexs' })
            }),
            fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'spotMeta' })
            })
        ]);

        if (!infoResponse.ok || !spotMetaResponse.ok) {
            throw new Error('Failed to fetch metadata from Hyperliquid');
        }

        const dexList = await infoResponse.json();
        const spotMeta = await spotMetaResponse.json();

        // 2. Build the Spot Name Mapper (Resolves "@n" to names like "HYPE")
        const tokenMap = new Map();
        spotMeta.tokens.forEach(t => tokenMap.set(t.index, t.name));

        const universeMap = new Map();
        spotMeta.universe.forEach((pair, index) => {
            const baseName = tokenMap.get(pair.tokens[0]) || `Unknown(${pair.tokens[0]})`;
            const quoteName = tokenMap.get(pair.tokens[1]);
            // If quote is USDC, use "HYPE". If not, use "HYPE/ETH"
            const readableName = (quoteName === 'USDC') ? baseName : `${baseName}/${quoteName}`;
            universeMap.set(`@${index}`, readableName);
        });

        // 3. Fetch active assets (allMids) from every DEX in parallel
        const pricePromises = dexList.map(dexEntry => {
            const payload = dexEntry === null 
                ? { type: 'allMids' } 
                : { type: 'allMids', dex: dexEntry.name };

            return fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => res.json());
        });

        const results = await Promise.all(pricePromises);

        // 4. Merge all raw keys into one set
        const rawPrices = Object.assign({}, ...results);
        const finalTokenList = [];

        // 5. Process and Rename keys
        for (const key of Object.keys(rawPrices)) {
            // CASE A: Main Spot Asset (e.g., "@1")
            if (key.startsWith('@')) {
                const realName = universeMap.get(key) || key;
                finalTokenList.push(realName);
            } 
            // CASE B: External Spot Asset (e.g., "xyz:@5")
            else if (key.includes(':@')) {
                const [dexPrefix, spotId] = key.split(':'); 
                const realName = universeMap.get(spotId);
                if (realName) {
                    finalTokenList.push(`${dexPrefix}:${realName}`);
                } else {
                    finalTokenList.push(key);
                }
            } 
            // CASE C: Standard Perps (e.g. "BTC", "xyz:AAPL") -> Keep as is
            else {
                finalTokenList.push(key);
            }
        }

        // Return sorted list
        return finalTokenList.sort((a, b) => a.localeCompare(b));

    } catch (error) {
        console.error("Token Fetcher Error:", error);
        // Fallback list in case API fails
        return ['BTC', 'ETH', 'SOL', 'HYPE', 'PURR'];
    }
}
