class Student {
  constructor(id, name, pollId) {
    this.id = id;
    this.name = name;
    this.pollId = pollId;
    this.answered = false;
    this.answer = null;
    this.joinedAt = new Date();
  }
}

module.exports = Student;