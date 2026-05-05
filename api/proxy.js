// Vercel Serverless Function - API Proxy for ODK
// Runs on server side - no CORS issues!
// Usage: POST /api/proxy with JSON body { endpoint, method, body, token }

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const { endpoint, method, body, token } = req.body || {};

    if (!endpoint) {
        return res.status(400).json({ error: 'Missing endpoint parameter' });
    }

    const targetUrl = `https://odk.otherside.xyz/api/v0/${endpoint}`;

    try {
        const fetchOptions = {
            method: method || 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (token) {
            fetchOptions.headers['Authorization'] = `Bearer ${token}`;
        }

        if (body && method && method !== 'GET') {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(targetUrl, fetchOptions);

        const contentType = response.headers.get('content-type') || '';

        let data;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        res.setHeader('Access-Control-Allow-Origin', '*');

        return res.status(response.status).json({
            status: response.status,
            statusText: response.statusText,
            data: data
        });

    } catch (error) {
        console.error('Proxy error:', error.message);
        return res.status(502).json({
            error: 'Proxy request failed',
            details: error.message,
            targetUrl: targetUrl
        });
    }
}
