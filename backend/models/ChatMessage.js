const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema(
  {
    pollId: { type: String, index: true },
    sender: { type: String, required: true }, // name
    type: { type: String, enum: ['teacher', 'student'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
