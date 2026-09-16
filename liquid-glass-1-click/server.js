const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const groups = {};

io.on('connection', (socket) => {
    let currentGroup = null;

    socket.on('joinGroup', (groupName) => {
        currentGroup = groupName;
        socket.join(groupName);
        if (!groups[groupName]) {
            groups[groupName] = { users: new Set(), answers: {}, votes: {} };
        }
        groups[groupName].users.add(socket.id);
        socket.emit('joined');
    });

    socket.on('submitAnswer', (answer) => {
        if (!currentGroup) return;
        const group = groups[currentGroup];
        group.answers[socket.id] = answer;
        io.to(currentGroup).emit('answersUpdate', Object.values(group.answers));

        if (Object.keys(group.answers).length >= group.users.size) {
            io.to(currentGroup).emit('startVoting', group.answers);
        }
    });

    socket.on('submitVote', (votedForId) => {
        if (!currentGroup) return;
        const group = groups[currentGroup];
        group.votes[socket.id] = votedForId;

        if (Object.keys(group.votes).length >= group.users.size) {
            const voteCounts = {};
            for (const vote of Object.values(group.votes)) {
                voteCounts[vote] = (voteCounts[vote] || 0) + 1;
            }
            
            let winnerId = null;
            let maxVotes = -1;
            for (const [id, count] of Object.entries(voteCounts)) {
                if (count > maxVotes) {
                    maxVotes = count;
                    winnerId = id;
                }
            }

            const winnerAnswer = group.answers[winnerId] || "Tie / No one";
            io.to(currentGroup).emit('showResults', winnerAnswer);

            setTimeout(() => {
                group.answers = {};
                group.votes = {};
                io.to(currentGroup).emit('startNextRound');
            }, 10000);
        }
    });

    socket.on('disconnect', () => {
        if (currentGroup && groups[currentGroup]) {
            groups[currentGroup].users.delete(socket.id);
            delete groups[currentGroup].answers[socket.id];
            delete groups[currentGroup].votes[socket.id];
            if (groups[currentGroup].users.size === 0) {
                delete groups[currentGroup];
            }
        }
    });
});

app.get('/admin', (req, res) => {
    const debugGroups = {};
    for (const [groupName, groupData] of Object.entries(groups)) {
        debugGroups[groupName] = {
            activeUserCount: groupData.users.size,
            answersSubmitted: groupData.answers,
            votesCast: groupData.votes
        };
    }
    res.json(debugGroups);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
