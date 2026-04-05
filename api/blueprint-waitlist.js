export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;
    const response = await fetch(
      'https://hooks.airtable.com/workflows/v1/genericWebhook/appyyjGuoyHBGQGW6/wflBgwqFvZIKVp6cX/wtr7I4qUcyoVNRDAB',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'blueprint-waitlist',
          timestamp: new Date().toISOString(),
        }),
      }
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(200).json({ success: true });
  }
}
