/**
 * token-fetcher.js
 * Fetches all tokens and resolves Spot names according to Hyperliquid standards:
 * 1. PURR/USDC is preserved or cleaned to PURR.
 * 2. @<n> resolves to the name of the base token in the universe pair at index n.
 */

async function getAllHyperliquidTokens() {
    try {
        console.log("Fetching Hyperliquid metadata...");

        // 1. Fetch DEX list and Spot Metadata
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
            throw new Error('Failed to fetch metadata');
        }

        const dexList = await infoResponse.json();
        const spotMeta = await spotMetaResponse.json();

        // ---------------------------------------------------------
        // 2. Build the Spot Name Mapper
        // ---------------------------------------------------------
        
        // A. Map Token ID -> Token Name (e.g. 150 -> "HYPE")
        const tokenIdToName = new Map();
        if (spotMeta.tokens && Array.isArray(spotMeta.tokens)) {
            spotMeta.tokens.forEach(t => {
                tokenIdToName.set(t.index, t.name);
            });
        }

        // B. Map Universe Index -> Real Name (e.g. @107 -> "HYPE")
        const universeIndexToName = new Map();
        if (spotMeta.universe && Array.isArray(spotMeta.universe)) {
            spotMeta.universe.forEach((pair, index) => {
                // pair is usually [baseTokenId, quoteTokenId] e.g. [150, 0]
                const baseTokenId = pair[0];
                const quoteTokenId = pair[1];

                const baseName = tokenIdToName.get(baseTokenId) || `Unknown(${baseTokenId})`;
                const quoteName = tokenIdToName.get(quoteTokenId);

                // Naming convention:
                // If quote is USDC (id 0 usually), just use Base Name (e.g. "HYPE").
                // Otherwise use "BASE/QUOTE".
                let finalName = baseName;
                if (quoteName && quoteName !== 'USDC') {
                    finalName = `${baseName}/${quoteName}`;
                }

                universeIndexToName.set(`@${index}`, finalName);
            });
        }

        // ---------------------------------------------------------
        // 3. Fetch Prices (allMids) from Main + External DEXs
        // ---------------------------------------------------------
        
        const pricePromises = dexList.map(dexEntry => {
            // Main DEX is null; others have a name string like "xyz"
            const payload = dexEntry === null 
                ? { type: 'allMids' } 
                : { type: 'allMids', dex: dexEntry.name };

            return fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .catch(err => {
                console.warn(`Failed to fetch mids for ${dexEntry?.name || 'Main'}:`, err);
                return {};
            });
        });

        const results = await Promise.all(pricePromises);

        // ---------------------------------------------------------
        // 4. Merge and Resolve Keys
        // ---------------------------------------------------------
        
        const rawPrices = Object.assign({}, ...results);
        const uniqueTokens = new Set();

        for (const key of Object.keys(rawPrices)) {
            // CASE 1: Standard Perps (e.g. "BTC", "ETH", "xyz:AAPL")
            // These don't start with @ and aren't PURR/USDC usually
            if (!key.startsWith('@') && !key.includes(':@') && key !== 'PURR/USDC') {
                uniqueTokens.add(key);
                continue;
            }

            // CASE 2: The special PURR case
            if (key === 'PURR/USDC') {
                uniqueTokens.add('PURR');
                continue;
            }

            // CASE 3: Main Spot Indices (e.g. "@107")
            if (key.startsWith('@')) {
                const realName = universeIndexToName.get(key);
                if (realName) {
                    uniqueTokens.add(realName);
                } else {
                    // Fallback: If we can't find the name, keep "@107" so it's at least selectable
                    uniqueTokens.add(key);
                }
                continue;
            }

            // CASE 4: External Dex Spot (e.g. "xyz:@5")
            // (Rare, but good to handle just in case)
            if (key.includes(':@')) {
                const parts = key.split(':');
                const prefix = parts[0];
                const spotIndex = parts[1]; // "@5"

                const realName = universeIndexToName.get(spotIndex);
                if (realName) {
                    uniqueTokens.add(`${prefix}:${realName}`);
                } else {
                    uniqueTokens.add(key);
                }
            }
        }

        // Convert Set to Array and Sort Alphabetically
        return Array.from(uniqueTokens).sort((a, b) => {
            // Optional: Force standard pairs like BTC to top, or just alpha sort
            return a.localeCompare(b);
        });

    } catch (error) {
        console.error("Token Fetcher Error:", error);
        // Robust Fallback so the UI doesn't crash completely
        return ['BTC', 'ETH', 'SOL', 'HYPE', 'PURR']; 
    }
}

