const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  socketId: { type: String, required: true },
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now }
});

const OptionSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true }, // matches frontend numeric id
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const AnswerSchema = new mongoose.Schema({
  studentSocketId: { type: String, required: true },
  studentName: { type: String, required: true },
  answer: { type: Number, required: true }, // option.id
  timestamp: { type: Date, default: Date.now }
});

const QuestionSchema = new mongoose.Schema({
  questionId: { type: String, required: true }, // uuid
  text: { type: String, required: true },
  options: { type: [OptionSchema], default: [] },
  timeLimit: { type: Number, default: 60 },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, default: null },
  answers: { type: [AnswerSchema], default: [] },
  results: {
    totalStudents: { type: Number, default: 0 },
    answered: { type: Number, default: 0 },
    options: { type: Map, of: new mongoose.Schema({
      text: String,
      count: Number,
      isCorrect: Boolean
    }, { _id: false }), default: {} }
  }
});

const PollSchema = new mongoose.Schema(
  {
    pollId: { type: String, unique: true, index: true },
    teacher: {
      id: String, // socket.id
      name: String
    },
    students: { type: [StudentSchema], default: [] },
    questions: { type: [QuestionSchema], default: [] },
    currentQuestionId: { type: String, default: null },
    status: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Poll', PollSchema);
