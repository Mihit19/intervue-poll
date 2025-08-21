const { v4: uuidv4 } = require('uuid');
const Poll = require('../models/Poll');
const ChatMessage = require('../models/ChatMessage');

const connectedUsers = new Map(); // socket.id -> { type, pollId, name }
const questionTimers = new Map(); // questionId -> timer

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // ---------------------------
    // CREATE POLL (Teacher)
    // ---------------------------
    socket.on('create-poll', async (data) => {
      try {
        const { pollId, teacherName } = data;
        if (!pollId || !teacherName) return;

        // upsert a fresh poll
        let poll = await Poll.findOne({ pollId });
        if (!poll) {
          poll = await Poll.create({
            pollId,
            teacher: { id: socket.id, name: teacherName },
            status: 'waiting',
            currentQuestionId: null,
            students: [],
            questions: []
          });
        } else {
          // If poll exists (teacher reconnect scenario), update teacher info/mark active
          poll.teacher = { id: socket.id, name: teacherName };
          poll.teacherDisconnected = false;
          await poll.save();
        }

        connectedUsers.set(socket.id, { type: 'teacher', pollId, name: teacherName });
        socket.join(pollId);

        console.log(`Poll created: ${pollId} by ${teacherName}`);
        socket.emit('poll-created', { pollId });

        // Send chat history
        const history = await ChatMessage.find({ pollId }).sort({ timestamp: 1 }).lean();
        socket.emit('chat-history', history);
      } catch (err) {
        console.error('create-poll error:', err);
        socket.emit('error', { message: 'Failed to create poll' });
      }
    });

    // Teacher reconnect (explicit)
    socket.on('teacher-reconnect', async ({ pollId }) => {
      try {
        const poll = await Poll.findOne({ pollId });
        if (!poll) {
          socket.emit('error', { message: 'Poll not found' });
          return;
        }
        poll.teacher = { id: socket.id, name: poll.teacher?.name || 'Teacher' };
        poll.teacherDisconnected = false;
        await poll.save();

        connectedUsers.set(socket.id, { type: 'teacher', pollId, name: poll.teacher.name });
        socket.join(pollId);

        io.to(pollId).emit('teacher-back', { message: 'Teacher reconnected' });
        socket.emit('poll-created', { pollId });
        console.log(`Teacher reconnected to poll ${pollId} with socket ${socket.id}`);
      } catch (err) {
        console.error('teacher-reconnect error:', err);
        socket.emit('error', { message: 'Failed to reconnect teacher' });
      }
    });

    // ---------------------------
    // JOIN POLL (Student)
    // ---------------------------
    socket.on('join-poll', async (data) => {
      try {
        const { pollId, studentName } = data;
        if (!pollId || !studentName) return;

        const poll = await Poll.findOne({ pollId });
        if (!poll) {
          socket.emit('error', { message: 'Poll not found' });
          return;
        }

        // Check duplicate name among active students
        const nameExists = poll.students.some((s) => s.name === studentName && s.active);
        if (nameExists) {
          socket.emit('error', { message: 'Name already taken in this poll' });
          return;
        }

        // add or reuse student entry
        poll.students.push({ socketId: socket.id, name: studentName, active: true });
        await poll.save();

        connectedUsers.set(socket.id, { type: 'student', pollId, name: studentName });
        socket.join(pollId);

        // notify
        io.to(pollId).emit('student-joined', {
          studentId: socket.id,
          studentName,
          totalStudents: poll.students.filter(s => s.active).length
        });

        // send chat history to the new student
        const messages = await ChatMessage.find({ pollId }).sort({ timestamp: 1 }).lean();
        socket.emit('chat-history', messages);

        // send current state
        const currentQuestion = poll.questions.find(q => q.questionId === poll.currentQuestionId) || null;
        socket.emit('joined-poll', {
          pollId,
          status: poll.status,
          currentQuestion: currentQuestion
            ? {
                id: currentQuestion.questionId,
                text: currentQuestion.text,
                options: currentQuestion.options,
                timeLimit: currentQuestion.timeLimit,
                questionId: currentQuestion.questionId
              }
            : null
        });
      } catch (err) {
        console.error('join-poll error:', err);
        socket.emit('error', { message: 'Failed to join poll' });
      }
    });

    // ---------------------------
    // ASK QUESTION (Teacher)
    // ---------------------------
    socket.on('ask-question', async (data) => {
      console.log('Mihit insocketmanager ask question');
      console.log(socket.id);
      const user = connectedUsers.get(socket.id);
      console.log('User:', user);

if (user) {
    console.log('User type:', user.type);
} else {
    console.log('User not found');
}
      if (!user || user.type !== 'teacher') return;
      console.log("after if statement")

      try {
        const poll = await Poll.findOne({ pollId: user.pollId });
        console.log(poll);
        if (!poll) return;

        const questionId = uuidv4();
        const question = {
          questionId,
          text: data.question,
          options: data.options, // [{id, text, isCorrect}]
          timeLimit: data.timeLimit,
          startTime: new Date(),
          endTime: null,
          answers: [],
          results: { totalStudents: 0, answered: 0, options: {} }
        };
        console.log(question);
        poll.questions.push(question);
        poll.currentQuestionId = questionId;
        poll.status = 'active';
        console.log(poll)
        await poll.save();

        // Broadcast to room
        io.to(user.pollId).emit('question-asked', {
          question: question.text,
          options: question.options,
          timeLimit: question.timeLimit,
          questionId
        });
        socket.emit('Teacher asked a question', (user.pollId ));

        // Start timer
        const timer = setTimeout(() => endQuestion(io, poll.pollId, questionId), data.timeLimit * 1000);
        questionTimers.set(questionId, timer);
      } catch (err) {
        console.error('ask-question error:', err);
      }
    });

    // ---------------------------
    // SUBMIT ANSWER (Student)
    // ---------------------------
    socket.on('submit-answer', async (data) => {
      const user = connectedUsers.get(socket.id);
      if (!user || user.type !== 'student') return;

      try {
        const poll = await Poll.findOne({ pollId: user.pollId });
        if (!poll || !poll.currentQuestionId) return;

        const question = poll.questions.find((q) => q.questionId === poll.currentQuestionId);
        if (!question) return;

        // prevent duplicate answers
        const hasAnswered = question.answers.some((a) => a.studentSocketId === socket.id);
        if (hasAnswered) return;

        // record
        question.answers.push({
          studentSocketId: socket.id,
          studentName: user.name,
          answer: data.answer
        });
        await poll.save();

        // notify teacher (if teacher socket exists)
        const answeredCount = question.answers.length;
        const totalStudents = poll.students.filter(s => s.active).length;

        if (poll.teacher && poll.teacher.id) {
          io.to(poll.teacher.id).emit('answer-received', {
            studentId: socket.id,
            studentName: user.name,
            answer: data.answer,
            answeredCount,
            totalStudents
          });
        }

        // if all answered, end early
        if (answeredCount >= totalStudents && totalStudents > 0) {
          await endQuestion(io, poll.pollId, question.questionId);
        }
      } catch (err) {
        console.error('submit-answer error:', err);
      }
    });

    // ---------------------------
    // CHAT
    // ---------------------------
    socket.on('send-message', async (data) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      try {
        const msg = await ChatMessage.create({
          pollId: user.pollId,
          sender: user.name,
          text: data.message,
          type: user.type
        });

        io.to(user.pollId).emit('new-message', {
          id: String(msg._id),
          sender: msg.sender,
          text: msg.text,
          timestamp: msg.timestamp,
          type: msg.type
        });
      } catch (err) {
        console.error('send-message error:', err);
      }
    });

    // ---------------------------
    // KICK STUDENT (Teacher)
    // ---------------------------
    socket.on('kick-student', async ({ studentId }) => {
      const user = connectedUsers.get(socket.id);
      if (!user || user.type !== 'teacher') return;

      try {
        const poll = await Poll.findOne({ pollId: user.pollId });
        if (!poll) return;

        const student = poll.students.find((s) => s.socketId === studentId && s.active);
        if (!student) return;

        student.active = false;
        await poll.save();

        // Notify the kicked student
        io.to(studentId).emit('kicked-out', {
          message: 'You have been removed from the poll by the teacher'
        });

        // Also remove student from the room
        try {
          if (io.sockets.sockets.get(studentId)) {
            io.sockets.sockets.get(studentId).leave(user.pollId);
          }
        } catch (e) {
          // ignore
        }

        // Notify others
        io.to(user.pollId).emit('student-kicked', {
          studentId,
          studentName: student.name,
          totalStudents: poll.students.filter(s => s.active).length
        });
      } catch (err) {
        console.error('kick-student error:', err);
      }
    });

    // ---------------------------
    // POLL HISTORY (Teacher requests)
    // ---------------------------
    socket.on('request-poll-history', async () => {
      const user = connectedUsers.get(socket.id);
      if (!user || user.type !== 'teacher') return;

      try {
        const poll = await Poll.findOne({ pollId: user.pollId });
        if (!poll) return;

        const history = poll.questions.map((q) => {
          // q.results.options is expected as Map-like (stored by you)
          const answered = q.results?.answered || (q.answers?.length || 0);
          const optionsWithPct = (q.options || []).map((opt) => {
            const count = q.results?.options?.get?.(String(opt.id))?.count || 0;
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

        socket.emit('poll-history', history);
      } catch (err) {
        console.error('request-poll-history error:', err);
      }
    });

    // ---------------------------
    // DISCONNECT
    // ---------------------------
    socket.on('disconnect', async (reason) => {
      console.log('User disconnected:', socket.id, reason);
      const user = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      if (!user) return;

      try {
        const poll = await Poll.findOne({ pollId: user.pollId });
        if (!poll) return;

        if (user.type === 'teacher') {
          // Instead of immediately ending poll, mark teacher as disconnected.
          poll.teacherDisconnected = true;
          // keep poll open for students to view results and allow teacher to reconnect
          await poll.save();

          io.to(user.pollId).emit('teacher-offline', { message: 'Teacher disconnected (temporary)' });
          console.log(`Teacher for poll ${user.pollId} marked offline (socket ${socket.id}).`);
        } else if (user.type === 'student') {
          const student = poll.students.find((s) => s.socketId === socket.id && s.active);
          if (student) {
            student.active = false;
            await poll.save();

            io.to(user.pollId).emit('student-left', {
              studentId: socket.id,
              studentName: student.name,
              totalStudents: poll.students.filter(s => s.active).length
            });
          }
        }
      } catch (err) {
        console.error('disconnect handling error:', err);
      }
    });
  });
};

/**
 * Ends a question: computes results, persists them, and emits 'question-ended'.
 */
async function endQuestion(io, pollId, questionId) {
  try {
    const poll = await Poll.findOne({ pollId });
    if (!poll) return;

    const question = poll.questions.find((q) => q.questionId === questionId);
    if (!question || question.endTime) return; // already ended

    // clear timer if exists
    const timer = questionTimers.get(questionId);
    if (timer) {
      clearTimeout(timer);
      questionTimers.delete(questionId);
    }

    question.endTime = new Date();
    poll.status = 'completed';

    // compute results
    // totalStudents should be count of active students at end OR all students that were present
    const totalStudents = poll.students.filter(s => s.active).length + poll.students.filter(s => !s.active).length;
    const answered = question.answers.length;
    const results = {
      totalStudents,
      answered,
      options: {}
    };

    // initialize
    question.options.forEach((opt) => {
      results.options[opt.id] = {
        text: opt.text,
        count: 0,
        isCorrect: !!opt.isCorrect
      };
    });

    // count
    question.answers.forEach((a) => {
      if (results.options[a.answer]) {
        results.options[a.answer].count++;
      }
    });

    // put into question.results (Map coercion)
    const optionsMap = new Map();
    Object.keys(results.options).forEach((k) => {
      optionsMap.set(String(k), {
        text: results.options[k].text,
        count: results.options[k].count,
        isCorrect: results.options[k].isCorrect
      });
    });

    question.results = {
      totalStudents,
      answered,
      options: optionsMap
    };

    await poll.save();

    io.to(pollId).emit('question-ended', {
      results,
      question: {
        id: question.questionId,
        text: question.text,
        options: question.options
      }
    });
  } catch (err) {
    console.error('endQuestion error:', err);
  }
}
