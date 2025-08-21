const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const polls = {}; // { pollId: { teacherId, students: [] } }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-poll', ({ pollId }) => {
    polls[pollId] = { teacherId: socket.id, students: [] };
    socket.join(pollId);
    console.log(`Poll created: ${pollId}`);
  });

  socket.on('join-poll', ({ pollId, studentName }) => {
    if (!polls[pollId]) {
      socket.emit('error', { message: 'Poll does not exist' });
      return;
    }
    socket.join(pollId);
    polls[pollId].students.push({ id: socket.id, name: studentName });
    io.to(polls[pollId].teacherId).emit('student-joined', { studentName });
    socket.emit('joined-poll', { pollId });
    console.log(`${studentName} joined poll: ${pollId}`);
  });

  socket.on('ask-question', ({ pollId, question }) => {
    if (!polls[pollId]) return;
    io.to(pollId).emit('new-question', { question });
    console.log(`Question sent to poll ${pollId}: ${question}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const pollId in polls) {
      const poll = polls[pollId];
      poll.students = poll.students.filter(s => s.id !== socket.id);
    }
  });
});

server.listen(5000, () => {
  console.log('Server running on port 5000');
});
