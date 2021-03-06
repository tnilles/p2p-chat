'use strict';

var socket = io(),
    nickname = '',
    peers = [], // collection of peernames TODO: use pcs instead
    pcs = [], // peer connections pcs[i] = {peername: 'my peer name', conn: <my RTCPeerConnection>}
    files = [],
    chunkLength = 1000; // Chunk length for file transfer

// Set up a default nickname (socket's id)
socket.on('connect', function(){
    nickname = nickname || socket.io.engine.id;
});

// Get references to the dom
var chatlog = document.getElementById('chatlog'),
    message = document.getElementById('message'),
    chatform = document.getElementById('chat-form'),
    changenameform = document.getElementById('change-name-form'),
    nameinput = document.getElementById('name'),
    clients = document.getElementById('clients'),
    banform = document.getElementById('ban-form'),
    banpeername = document.getElementById('banpeername'),
    receivefile = document.getElementById('receive-file');

// generate a unique-ish string
var id = function() { return (Math.random() * 10000 + 10000 | 0).toString(); };

var addMessage = function(from, msg) {
    // TODO: appendChild instead of innerHTML, in order to prevent the whole dom to reload
    chatlog.innerHTML += '<div><span class="author">' + from + '</span> <span class="message">' + msg + '</span></div>';
};

var addVideo = function(from, src, fileId) {
    addMessage(from, '<video src="' + src + '" id="' + fileId + '" controls></video>');
    var video = document.getElementById(fileId);
    video.addEventListener('play', function() {
        send({ id: fileId, command: 'play', type: 'video-control' });
    });
    video.addEventListener('pause', function() {
        send({ id: fileId, command: 'pause', type: 'video-control' });
    });
    video.addEventListener('seeking', function(e) {
        // Make sure that we don't send seeking order back to the peer
        var file = getFile(fileId);
        if (file.lastSeeking !== e.target.currentTime) {
            file.lastSeeking = -1;
            send({ id: fileId, command: 'seekTo', type: 'video-control', time: e.target.currentTime });
        }
    });
};

// Files utilities
var getFile = function(id) {
    for (var i = 0, n = files.length; i < n; i++) {
        if (files[i].id === id) {
            return files[i];
        }
    }
    return false;
};

var removeFile = function(id) {
    for (var i = 0, n = files.length; i < n; i++) {
        if (files[i].id === id) {
            files.splice(i, 1);
            break;
        }
    }
    return false;
};

// All datachannel messages goes in here
var onMessage = function(e) {
    var data = JSON.parse(e.data),
        file;

    switch (data.type) {
        case 'text':
            // add the message to the chat log
            addMessage(data.from, data.message);
        break;

        case 'file':
            // First chunk: define file type, size and name
            if (data.data.firstChunk) {
                files.push({
                    id: data.data.fileId,
                    chunks: [], // file-transfer chunks
                    numReceivedChunks: 0,
                    size: data.data.filesize,
                    name: data.data.filename,
                    type: data.data.filetype,
                    from: data.data.from
                });
            }

            file = getFile(data.data.fileId);

            // Refresh the % in the UI
            updateFileLoading((file.numReceivedChunks * 1000 * 100) / file.size);

            // Store the chunk
            file.chunks[data.data.part] = data.data.message;
            file.numReceivedChunks++;

            // Last chunk received
            if (file.numReceivedChunks === Math.ceil(file.size / chunkLength)) {
                if (file.type.match(/image\/.+/)) { // file is an image, show it in the chat
                    addMessage(file.from, '<img src="' + file.chunks.join('') + '" />');
                } else if (file.type.match(/video\/.+/)) { // file is a video, show it in the chat
                    addVideo(file.from, file.chunks.join(''), file.id);
                } else { // other types: save to disk
                    saveToDisk(file.chunks.join(''), file.name);
                }

                updateFileLoading(100);
            }
        break;

        case 'video-control':
            switch(data.command) {
                case 'play':
                    document.getElementById(data.id).play();
                break;

                case 'pause':
                    document.getElementById(data.id).pause();
                break;

                case 'seekTo':
                    document.getElementById(data.id).currentTime = data.time;
                    getFile(data.id).lastSeeking = data.time;
                break;
            }
        break;
    }
};

// TODO: Handle multiple files
var updateFileLoading = function(pct) {
    receivefile.innerHTML = 'downloading a file... (' + (+parseFloat(pct).toFixed(2)) + '%)';
    if (pct === 100) receivefile.innerHTML = '';
};

// Invite another peer
var invitePeer = function(peername) {
    // Check if the peer isn't already connected
    if (peers.indexOf(peername) === -1 && peername !== nickname) {
        var connection = new RTCNetwork();
        connection.onMessage = onMessage;
        connection.connectWith(peername, nickname, function() {
            // Tell the other peer which peers we're connected to, so he can invite them too
            socket.emit('checkmypeers', JSON.stringify({peers: peers, to: peername}));
        });

        pcs.push({conn: connection, peername: peername});
        peers.push(peername);
    } else {
        console.log('Already connected to ', peername);
    }
};

document.body.addEventListener('click', function(e) {
    var target = e.target;
    if (target.className.match(/add-peer/)) { // Matches the add peer button
        invitePeer(target.innerHTML);
    }
});

// Server tells us to invite those peers
socket.on('invitepeers', function(data) {
    data = JSON.parse(data);
    if (!data.peers) return;
    for (var i = 0, n = data.peers.length; i < n; i++) {
        invitePeer(data.peers[i]);
    }
});

// Receive another peer's invitation
socket.on('invitation', function(data) {
    data = JSON.parse(data);

    // Make sure we're not sending an invitation to ourselves
    if (peers.indexOf(data.peername) === -1) {
        var connection = new RTCNetwork();
        connection.onMessage = onMessage;
        connection.listen(data.linkId);

        connection.subscribeChannel(function(channel) {
            if (channel) {
                pcs.push({conn: connection, peername: data.peername});
                // Tell the other peer which peers we're connected to, so he can invite them too
                socket.emit('checkmypeers', JSON.stringify({peers: peers, to: data.peername}));
            }
        });

        peers.push(data.peername);
    } else {
        console.log('Already connected to ', data.peername);
    }
});

// TODO: this need to be updated through a socket, not a simple get
// Get the list of peernames connected and show them in the UI
var getClients = function() {
    $.get('getClients', {}, function(clientsList) {
        clients.innerHTML = '';
        var fragment = document.createDocumentFragment();
        for (var i = 0, n = clientsList.length; i < n; i++) {
            var elm = document.createElement('a');
            elm.appendChild(document.createTextNode(clientsList[i]));
            elm.setAttributeNS(null, 'class', 'add-peer');
            fragment.appendChild(elm);
        }
        clients.appendChild(fragment);
    });
};

// Event Listeners
chatform.addEventListener('submit', function(e) {
    e.preventDefault();
    sendMessage();
})

changenameform.addEventListener('submit', function(e) {
    e.preventDefault();
    socket.emit('changename', nameinput.value);
});

banform.addEventListener('submit', function(e) {
    e.preventDefault();
    $.post('ban', {peername: banpeername.value});
});

// Send a file when the file input changes
document.querySelector('#chat-form input[type=file]').onchange = function() {
    var sendFile = this.files[0],
        reader = new window.FileReader(),
        fileId = id();

    reader.readAsDataURL(sendFile);
    reader.onload = function(event) {
        if (sendFile.type.match(/image\/.+/)) { // file is an image, show it in the chat
            addMessage('me', '<img src="' + event.target.result + '" />');
        } else if (sendFile.type.match(/video\/.+/)) { // file is a video, show it in the chat
            addVideo('me', event.target.result, fileId);
        }
        onReadAsDataURL(event, fileId, nickname, undefined, sendFile.name, sendFile.type, pcs);
    };
};

// Remove peer from our peer list if he's not connected anymore
socket.on('peerdisconnected', function(data) {
    data = JSON.parse(data);
    var index = peers.indexOf(data.peername);
    if (index === -1) return;
    peers.splice(index, 1);
    removePc(data.peername);
});

// Tell the user he has been banned
socket.on('banned', function(data) {
    addMessage('server', 'You\'ve been banned');
});

// Wait for server answer to change nickname
socket.on('reschangename', function(data) {
    if (data) {
        nickname = data;
    } else {
        window.alert('This name has already been taken. Please pick another one.');
    }
});

var removePc = function(peername) {
    for (var i = 0, n = pcs.length; i < n; i++) {
        if (pcs[i].peername === peername) break;
    }
    if (pcs[i].peername !== peername) return;
    pcs[i].conn.channel.close();
    pcs.splice(i, 1);
};

// Send a text message
var sendMessage = function() {
    var msg = message.value;
    send({
        message: msg,
        from: nickname,
        type: 'text'
    });
    addMessage('me', msg);
    message.value = '';
};

// Generic data send to all connected peers
var send = function(toSend) {
    pcs.map(function(pc) {
        if (pc.conn.channel.readyState === 'open') {
            try {
                pc.conn.channel.send(JSON.stringify(toSend));
            } catch (error) {
                console.log('couldn\'t send message: ', error);
            }
        } else {
            console.log('couldn\'t send message to this unopen channel: ', pc.conn.channel);
        }
    });
};