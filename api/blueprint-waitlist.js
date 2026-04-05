const AIRTABLE_URL = 'https://api.airtable.com/v0/appyyjGuoyHBGQGW6/tblu1x5gQGOrXndNA';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, website } = req.body;

  // Honeypot — bots fill this hidden field, real users don't
  if (website) {
    return res.status(200).json({ success: true });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Upsert with fields that should always be set (including Status — higher intent)
    const response = await fetch(AIRTABLE_URL, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        performUpsert: {
          fieldsToMergeOn: ['fldJ08DTKhozkDJWE'],
        },
        typecast: true,
        records: [
          {
            fields: Object.assign(
              {
                fldJ08DTKhozkDJWE: email,
                fld5KmOTl7wiBGIKB: true,
                fldUW1uDfyi9nx4jL: today,
                fld0XVEetTYi0hTFt: 'Blueprint Waitlist',
              },
              name ? { fldJ2LpKHwaiTGTr5: name } : {}
            ),
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Airtable error:', err);
      return res.status(500).json({ error: 'Failed to save' });
    }

    const data = await response.json();
    const record = data.records[0];
    const isNew = data.createdRecords?.includes(record.id);

    // Only set Source on brand-new records
    if (isNew) {
      await fetch(AIRTABLE_URL, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          typecast: true,
          records: [
            {
              id: record.id,
              fields: {
                fldbVNv2ylQud26pk: 'Blueprint Page',
              },
            },
          ],
        }),
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Blueprint waitlist error:', err);
    res.status(200).json({ success: true });
  }
}
