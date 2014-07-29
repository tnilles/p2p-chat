'use strict';

var socket = io(),
    nickname = '',
    peers = [],
    pcs = []; // peer connections pcs[i] = {peername, conn}

// Set up a default nickname (socket's id)
socket.on('connect', function(){
    nickname = nickname || socket.io.engine.id;
});

// get references to the document tags
var chatlog = document.getElementById('chatlog'),
    message = document.getElementById('message'),
    chatform = document.getElementById('chat-form'),
    changenameform = document.getElementById('change-name-form'),
    nameinput = document.getElementById('name'),
    clients = document.getElementById('clients'),
    banform = document.getElementById('ban-form'),
    banpeername = document.getElementById('banpeername');

var addMessage = function(from, msg) {
    chatlog.innerHTML += '<div>' + from + ': ' + msg + '</div>';
};

var onMessage = function(e) {
    var data = JSON.parse(e.data);
    // add the message to the chat log
    addMessage(data.from, data.message);
};

// Invite another peer
var invitePeer = function(peername) {
    // Check if the peer isn't already connected
    if (peers.indexOf(peername) === -1 && peername !== nickname) {
        var connection = new RTCNetwork();
        connection.onMessage = onMessage;
        connection.connectWith(peername, nickname, function() {
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
    if (target.className.match(/add-peer/)) {
        invitePeer(target.innerHTML);
    }
});

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

    if (peers.indexOf(data.peername) === -1) {
        var connection = new RTCNetwork();
        connection.onMessage = onMessage;
        connection.listen(data.linkId);

        connection.subscribeChannel(function(channel) {
            if (channel) {
                pcs.push({conn: connection, peername: data.peername});
                socket.emit('checkmypeers', JSON.stringify({peers: peers, to: data.peername}));
            }
        });

        peers.push(data.peername);
    } else {
        console.log('Already connected to ', data.peername);
    }
});

// TODO: this need to be updated through a socket, not a simple get
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

// Remove peer from our peer list if he's not connected anymore
// TODO: Remove the peerConnection too
socket.on('peerdisconnected', function(data) {
    data = JSON.parse(data);
    var index = peers.indexOf(data.peername);
    if (index === -1) return;
    peers.splice(index, 1);
    removePc(data.peername);
});

socket.on('banned', function(data) {
    addMessage('server', 'You\'ve been banned');
});

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

// send a message the textbox through
// the data channel for a chat program
function sendMessage () {
    var msg = message.value;
    pcs.map(function(pc) {
        if (pc.conn.channel.readyState === 'open') {
            try {
                pc.conn.channel.send(JSON.stringify({
                    message: msg,
                    from: nickname
                }));
            } catch (error) {
                console.log('couldn\'t send message: ', error);
            }
        } else {
            console.log('couldn\'t send message to this unopen channel: ', pc.conn.channel);
        }
    });
    message.value = '';
}