var socket = io(),
    channels = [],
    nickname = '';

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


var onMessage = function (e) {
    var data = JSON.parse(e.data);
    // add the message to the chat log
    chatlog.innerHTML += '<div>' + data.from + ': ' + data.message + '</div>';
};

document.body.addEventListener('click', function(e) {
    var target = e.target;
    if (target.className.match(/add-peer/)) {
        var connection = new RTCNetwork();
        connection.onMessage = onMessage;
        connection.connectWith(target.innerHTML);
        channels.push(connection.channel);
    }
});

socket.on('invitation', function(linkId) {
    var connection = new RTCNetwork();
    connection.onMessage = onMessage;
    connection.listen(linkId);

    connection.subscribeChannel(function(channel) {
        if (channel) {
            channels.push(channel);
        }
    });
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

// send a message the textbox throught
// the data channel for a chat program
function sendMessage () {
    var msg = message.value;
    channels.map(function(channel) {
        channel.send(JSON.stringify({
            message: msg,
            from: nickname
        }));
    });
    message.value = '';
}