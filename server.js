var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    path = require('path'),
    http = require('http').Server(app),
    mongojs = require('mongojs'),
    io = require('socket.io')(http);

var dbURL = 'p2pchat',
    collections = ['messages', 'rooms'],
    db = mongojs.connect(dbURL, collections);

// Static assets
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/vendor', express.static(path.join(__dirname, 'vendor')));


// Usage: /getRoomInfo?room=[roomId]&key=[key]&value=[value]
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
        if (err || !found) {
            res.status(500);
            res.end();
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(found[0][req.query.key])); // return the first matching room
    });
});

var updateClients = function(room, key, value) {
    console.log('broadcasting to clients event:' + room + ':' + key);
    io.emit('roomInfoChanged:' + room + ':' + key, {room: room, type: key, data: value});
};

app.get('/', function(req, res){
    res.sendfile('index.html');
});

io.on('connection', function(socket){
    console.log('a user connected');

    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});