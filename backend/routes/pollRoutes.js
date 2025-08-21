const express = require('express');
const Poll = require('../models/Poll');
const router = express.Router();

router.get('/:pollId/history', async (req, res) => {
  try {
    const poll = await Poll.findOne({ pollId: req.params.pollId });
    if (!poll) return res.status(404).json({ message: 'Poll not found' });

    const history = poll.questions.map((q) => {
      const optionsWithPct = q.options.map((opt) => {
        const count = q.results?.options?.get(String(opt.id))?.count || 0;
        const answered = q.results?.answered || 0;
        const pct = answered ? Math.round((count / answered) * 100) : 0;
        return { text: opt.text, percentage: pct, isCorrect: !!opt.isCorrect };
      });
      return {
        id: q.questionId,
        question: q.text,
        options: optionsWithPct,
        timestamp: q.startTime
      };
    });

    res.json(history);
  } catch (e) {
    console.error('History error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
