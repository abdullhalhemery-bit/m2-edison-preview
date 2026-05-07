export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed. Use POST or GET.' });
    }

    let { endpoint, method, body, token, extraHeaders, targetBase } = req.method === 'GET'
        ? req.query
        : (req.body || {});

    if (!endpoint || !method) {
        return res.status(400).json({ error: 'Missing required fields: endpoint, method' });
    }

    const bases = {
        'odk': 'https://odk.otherside.xyz/api/v0/',
        'otherside': 'https://www.otherside.xyz/',
        'glyph': 'https://useglyph.io/',
        'msquared': 'https://msquared.io/',
        'identity': 'https://identitytoolkit.googleapis.com/v1/',
        'decent': 'https://api.decent.xyz/',
        'halliday': 'https://api.halliday.xyz/',
        'alchemy': 'https://eth-mainnet.g.alchemy.com/v2/',
        'alchemy-arb': 'https://arb-mainnet.g.alchemy.com/v2/',
        'alchemy-ape': 'https://apechain-mainnet.g.alchemy.com/v2/',
        'moonpay': 'https://api.moonpay.com/',
        'moonpay-sandbox': 'https://api.sandbox.moonpay.com/',
        'privy': 'https://auth.privy.io/',
        'privy-api': 'https://api.privy.io/',
        'okta': 'https://yuga-labs.okta.com/',
        'walletconnect': 'https://explorer-api.walletconnect.com/',
        'default': 'https://odk.otherside.xyz/api/v0/',
    };

    const baseUrl = bases[targetBase] || bases['default'];
    const targetUrl = `${baseUrl}${endpoint}`;

    try {
        const fetchOptions = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'M2-ODK-SecurityResearch/2.0',
            },
        };

        if (token) {
            fetchOptions.headers['Authorization'] = `Bearer ${token}`;
        }

        if (extraHeaders) {
            // Pass through API key headers and any other custom headers
            Object.assign(fetchOptions.headers, extraHeaders);
        }

        if (body && method !== 'GET' && method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(targetUrl, fetchOptions);

        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                data = text.substring(0, 5000);
            }
        }

        return res.status(200).json({
            status: response.status,
            statusText: response.statusText,
            data: data,
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Proxy request failed',
            message: error.message,
        });
    }
}
