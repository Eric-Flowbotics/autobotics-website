const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid' || session.amount_total === 0) {
      // Write to Airtable
      try {
        await fetch('https://hooks.airtable.com/workflows/v1/genericWebhook/appyyjGuoyHBGQGW6/wfl_placeholder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.customer_details?.email || '',
            name: session.customer_details?.name || '',
            product: 'The Operators Toolkit',
            amount: session.amount_total / 100,
            currency: session.currency,
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent,
            date: new Date().toISOString(),
          }),
        });
      } catch (airtableErr) {
        console.error('Airtable webhook error:', airtableErr);
        // Don't fail the success page if Airtable fails
      }

      return res.status(200).json({
        success: true,
        email: session.customer_details?.email || '',
        name: session.customer_details?.name || '',
        amount: session.amount_total / 100,
      });
    } else {
      return res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (err) {
    console.error('Session retrieve error:', err);
    return res.status(500).json({ error: 'Failed to verify payment' });
  }
};
