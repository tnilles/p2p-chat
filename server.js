var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    path = require('path'),
    http = require('http').Server(app),
    mongojs = require('mongojs'),
    io = require('socket.io')(http);

var dbURL = 'p2pchat',
    collections = ['messages', 'rooms'],
    db = mongojs.connect(dbURL, collections),
    clients = [];

// Static assets
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/vendor', express.static(path.join(__dirname, 'vendor')));


// Usage: /addRoomInfo + params: room=[roomId] key=[key] value=[value]
app.post('/addRoomInfo', function(req, res) {
    var pair = {};
    pair[req.body.key] = req.body.value;

    // Insert or update room if it already exists
    db.rooms.update({room: req.body.room}, {$set: pair}, {upsert: true}, function(err) {
        if (err) {
            res.status(500);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(err));
        } else {
            updateClients(req.body.room, req.body.key, req.body.value);
        }
    });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({success: true}));
});

// Usage: /getRoomInfo?room=[roomId]&key=[key]
app.get('/getRoomInfo', function(req, res) {
    db.rooms.find({room: req.query.room}, function(err, found) {
        if (err || !found || found.length === 0) {
            res.end();
            return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(found[0][req.query.key])); // return the first matching room
    });
});

// Get the list of clients' names
app.get('/getClients', function(req, res) {
    var clientsList = [];
    for (var i = 0, numClients = clients.length; i < numClients; i++) {
        clientsList.push(clients[i].name);
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(clientsList));
});

// Ban a peer
app.post('/ban', function(req, res) {
    console.log('banning ', req.body.peername);
    var toBan = getClient(req.body.peername);
    toBan && removeClient(toBan.socket.client.id);
});

var updateClients = function(room, key, value) {
    io.emit('roomInfoChanged:' + room + ':' + key, {room: room, type: key, data: value});
};

app.get('/', function(req, res){
    res.sendfile('index.html');
});

io.on('connection', function(socket){
    console.log('a user connected', socket.client.id);
    clients.push({name: socket.client.id, socket: socket});

    socket.on('changename', function(name) {
        // Enforce unique names
        if (getClient(name)) {
            socket.emit('reschangename', false);
        } else {
            changeName(socket.client.id, name);
            socket.emit('reschangename', name); // Confirm that we've changed name
        }
    });

    socket.on('invitepeer', function(data) {
        data = JSON.parse(data);
        var otherPeer = getClient(data.peer);
        if (!otherPeer) return;
        otherPeer.socket.emit('invitation', JSON.stringify({linkId: data.linkId, peername: data.from}));
    });

    socket.on('checkmypeers', function(data) {
        data = JSON.parse(data);
        var otherPeer = getClient(data.to);
        otherPeer && otherPeer.socket.emit('invitepeers', JSON.stringify({peers: data.peers}));
    });

    socket.on('disconnect', function(){
        console.log('user disconnected');
        removeClient(socket.client.id);
    });
});

var getClient = function(name) {
    for (var i = 0, n = clients.length; i < n; i++) {
        if (clients[i].name === name) {
            return clients[i];
        }
    }
    return false;
};

var changeName = function(socketId, name) {
    for (var i = 0, numClients = clients.length; i < numClients; i++) {
        if (clients[i].socket.client.id === socketId) {
            clients[i].name = name;
            break;
        }
    }
};

var removeClient = function(socketId) {
    for (var i = 0, n = clients.length; i < n; i++) {
        if (clients[i].socket.client.id === socketId) {
            break;
        }
    }
    if (!clients[i] || clients[i].socket.client.id !== socketId) return;
    // Tell other peers that one disconnected
    clients[i].socket.emit('banned', '');
    clients[i].socket.broadcast.emit('peerdisconnected', JSON.stringify({peername: clients[i].name}));
    clients.splice(i, 1);
};

http.listen(3000, function(){
    console.log('listening on *:3000');
});