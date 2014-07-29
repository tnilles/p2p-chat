'use strict';

var socket = io(),
    nickname = '',
    peers = [],
    pcs = []; // peer connections

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
    clients = document.getElementById('clients');


var onMessage = function(e) {
    var data = JSON.parse(e.data);
    // add the message to the chat log
    chatlog.innerHTML += '<div>' + data.from + ': ' + data.message + '</div>';
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

        pcs.push(connection);
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
                pcs.push(connection);
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

socket.on('reschangename', function(data) {
    if (data) {
        nickname = data;
    } else {
        window.alert('This name has already been taken. Please pick another one.');
    }
});

// send a message the textbox through
// the data channel for a chat program
function sendMessage () {
    var msg = message.value;
    pcs.map(function(pc) {
        if (pc.channel.readyState === 'open') {
            try {
                pc.channel.send(JSON.stringify({
                    message: msg,
                    from: nickname
                }));
            } catch (error) {
                console.log('couldn\'t send message: ', error);
            }
        } else {
            console.log('couldn\'t send message to this unopen channel: ', pc.channel);
        }
    });
    message.value = '';
}