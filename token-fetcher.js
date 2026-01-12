/**
 * token-fetcher.js
 * Fetches ALL tokens by combining:
 * 1. The full registry of Spot Tokens (e.g., USDC, USDH, UBTC).
 * 2. The active Perp markets (e.g., BTC, ETH).
 * 3. Resolves Spot market IDs (e.g., @107 -> HYPE).
 */

async function getAllHyperliquidTokens() {
    try {
        // 1. Fetch Metadata (Perp DEXs list and Spot Metadata)
        const [perpDexsResponse, spotMetaResponse] = await Promise.all([
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

        if (!perpDexsResponse.ok || !spotMetaResponse.ok) {
            throw new Error('Failed to fetch metadata from Hyperliquid');
        }

        const dexList = await perpDexsResponse.json();
        const spotMeta = await spotMetaResponse.json();

        // ---------------------------------------------------------
        // 2. Prepare Name Mappings
        // ---------------------------------------------------------
        
        // Map Token Index -> Name (e.g., 0 -> "USDC", 150 -> "HYPE")
        const tokenIndexToName = new Map();
        if (spotMeta.tokens) {
            spotMeta.tokens.forEach(t => {
                tokenIndexToName.set(t.index, t.name);
            });
        }

        // Map Universe Index -> Human Readable Name (e.g., "@107" -> "HYPE")
        const universeMapping = new Map();
        if (spotMeta.universe) {
            spotMeta.universe.forEach(u => {
                const universeName = u.name; // e.g., "@107"
                const [baseId, quoteId] = u.tokens; // e.g., [150, 0]

                const baseName = tokenIndexToName.get(baseId) || `Unknown(${baseId})`;
                const quoteName = tokenIndexToName.get(quoteId) || `Unknown(${quoteId})`;

                let readableName;
                // If quote is USDC, just use the Base Name (e.g., HYPE)
                // Otherwise, use Pair format (e.g., UBTC/USDH)
                if (quoteName === 'USDC') {
                    readableName = baseName;
                } else {
                    readableName = `${baseName}/${quoteName}`;
                }

                universeMapping.set(universeName, readableName);
                universeMapping.set(`@${u.index}`, readableName);
            });
        }

        // ---------------------------------------------------------
        // 3. Build Final Token Set
        // ---------------------------------------------------------
        const finalSet = new Set();

        // STEP A: Add ALL raw spot tokens found in metadata (Fixes missing USDC)
        if (spotMeta.tokens) {
            spotMeta.tokens.forEach(t => {
                finalSet.add(t.name);
            });
        }

        // STEP B: Fetch Active Markets (Perps) to ensure we get BTC, ETH, etc.
        const pricePromises = dexList.map(dexEntry => {
            const payload = dexEntry === null 
                ? { type: 'allMids' } 
                : { type: 'allMids', dex: dexEntry.name };

            return fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .catch(e => ({}));
        });

        const results = await Promise.all(pricePromises);
        const allPrices = Object.assign({}, ...results);

        // STEP C: Process Active Market Keys
        for (const key of Object.keys(allPrices)) {
            // Case 1: Spot Pair Index (e.g., "@107") -> Resolve to Name
            if (universeMapping.has(key)) {
                finalSet.add(universeMapping.get(key));
            }
            // Case 2: External DEX Spot (e.g., "xyz:@5")
            else if (key.includes(':@')) {
                const [dexPrefix, spotIdentifier] = key.split(':');
                const resolvedName = universeMapping.get(spotIdentifier);
                
                if (resolvedName) {
                    finalSet.add(`${dexPrefix}:${resolvedName}`);
                } else {
                    finalSet.add(key);
                }
            }
            // Case 3: Standard Perps (e.g., "BTC", "ETH")
            // These don't start with @ and aren't in the map, so we just add them.
            else if (!key.startsWith('@')) {
                finalSet.add(key);
            }
        }

        // ---------------------------------------------------------
        // 4. Return Sorted List
        // ---------------------------------------------------------
        return Array.from(finalSet).sort((a, b) => a.localeCompare(b));

    } catch (error) {
        console.error("Token Fetcher Error:", error);
        return [];
    }
}
