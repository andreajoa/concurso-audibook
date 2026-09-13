const marketing = require('../lib/marketing-cron-handler');
const editorial = require('../lib/editorial-cron-handler');

// Both scheduled URLs share one function to fit the Vercel Hobby limit.
module.exports = (req, res) => {
  if (req.query?.job === 'marketing') return marketing(req, res);
  if (req.query?.job === 'editorial') return editorial(req, res);
  return res.status(404).json({ error: 'Cron job not found.' });
};
