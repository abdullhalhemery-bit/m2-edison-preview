export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { endpoint, method, body, token } = req.body || {};

  if (!endpoint || !method || !token) {
    return res.status(400).json({ error: 'Missing required fields: endpoint, method, token' });
  }

  const targetUrl = `https://odk.otherside.xyz/api/v0/${endpoint}`;

  try {
    const fetchOptions = {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
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
