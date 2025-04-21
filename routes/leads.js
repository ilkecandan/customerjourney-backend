// Before: GET /api/leads/:userId
router.get('/:userId', async (req, res) => {
  const requestedUserId = parseInt(req.params.userId);
  const providedUserId = parseInt(req.headers['x-user-id']); // Send this from frontend

  if (requestedUserId !== providedUserId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    const leads = await pool.query('SELECT * FROM leads WHERE user_id = $1', [requestedUserId]);
    res.json(leads.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
