const AIRTABLE_URL = 'https://api.airtable.com/v0/appyyjGuoyHBGQGW6/tblu1x5gQGOrXndNA';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid' && session.amount_total !== 0) {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const email = session.customer_details?.email || '';
    const name = session.customer_details?.name || '';
    const today = new Date().toISOString().slice(0, 10);

    // Write to Airtable — upsert by email, always set Status to customer
    if (email) {
      try {
        const fields = {
          fldJ08DTKhozkDJWE: email,
          fldVVgY89sMco4X0H: true,
          fld65Pd4dhqLnnP5o: today,
          fld0XVEetTYi0hTFt: 'Toolkit Customer',
        };
        if (name) {
          fields.fldJ2LpKHwaiTGTr5 = name;
        }

        await fetch(AIRTABLE_URL, {
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
            records: [{ fields }],
          }),
        });
      } catch (airtableErr) {
        console.error('Airtable error:', airtableErr);
      }
    }

    return res.status(200).json({
      success: true,
      email,
      name,
      amount: session.amount_total / 100,
    });
  } catch (err) {
    console.error('Session retrieve error:', err);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
};
