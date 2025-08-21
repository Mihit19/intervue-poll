class Question {
  constructor(id, text, options, timeLimit = 60) {
    this.id = id;
    this.text = text;
    this.options = options; // Array of option objects { id, text }
    this.timeLimit = timeLimit; // in seconds
    this.answers = new Map(); // studentId -> answer
    this.startTime = null;
    this.endTime = null;
  }
}

module.exports = Question;