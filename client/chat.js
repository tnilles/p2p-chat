var socket = io();

// shims!
var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection,
    SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription,
    IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

// generate a unique-ish string
function id () {
    return (Math.random() * 10000 + 10000 | 0).toString();
}

// a nice wrapper to send data to the server
function send (room, key, data) {
    console.log('send: ', {room: room, key: key, value: data});
    $.post('addRoomInfo', {room: room, key: key, value: data});
}

// wrapper function to receive data from the server
function recv (room, type, cb) {
    $.get('getRoomInfo', {room: room, key: type}, function(data) {
        cb(data);
    });
    socket.on('roomInfoChanged:' + room + ':' + type, function(data) {
        if (data && data.room === room) {
            console.log('recv: ', data);
            cb(data.data);
        }
    });
    console.log('--- listening for roomInfoChanged:' + room + ':' + type);
}

// generic error handler
function errorHandler (err) {
    console.error(err);
}

// determine what type of peer we are,
// offerer or answerer.
var ROOM = location.hash.substr(1);
var type = "answerer";
var otherType = "offerer";

// no room number specified, so create one
// which makes us the offerer
if (!ROOM) {
    ROOM = id();
    type = "offerer";
    otherType = "answerer";

    document.write("<a href='#"+ROOM+"'>Send link to other peer</a>");
}

console.log('room id: ', ROOM);

// generate a unique-ish room number
var ME = id();

// get references to the document tags
var chatlog = document.getElementById("chatlog"),
    message = document.getElementById("message"),
    chatform = document.getElementById('chat-form');

// options for the PeerConnection
var server = {
    iceServers: [
        {url: "stun:23.21.150.121"},
        {url: "stun:stun.l.google.com:19302"},
        {url: "turn:numb.viagenie.ca", credential: "webrtcdemo", username: "contact%40thierrynilles.com"}
    ]
};

var options = {
    optional: [
        {DtlsSrtpKeyAgreement: true},
        {RtpDataChannels: true} //required for Firefox
    ]
};

// create the PeerConnection
var pc = new PeerConnection(server, options);

pc.onicecandidate = function (e) {
    // take the first candidate that isn't null
    if (!e.candidate) { return; }
    pc.onicecandidate = null;

    // request the other peers ICE candidate
    recv(ROOM, "candidate:" + otherType, function (candidate) {
        pc.addIceCandidate(new IceCandidate(JSON.parse(candidate)));
    });

    // send our ICE candidate
    send(ROOM, "candidate:"+type, JSON.stringify(e.candidate));
};

// constraints on the offer SDP.
var constraints = {};

// define the channel var
var channel;

connect();

// start the connection!
function connect () {
    console.log('starting the connection');
    if (type === "offerer") {
        // offerer creates the data channel
        channel = pc.createDataChannel("mychannel", {});

        // can bind events right away
        bindEvents();

        // create the offer SDP
        pc.createOffer(function (offer) {
            pc.setLocalDescription(offer);

            // send the offer SDP to FireBase
            send(ROOM, "offer", JSON.stringify(offer));

            // wait for an answer SDP from FireBase
            recv(ROOM, "answer", function (answer) {
                pc.setRemoteDescription(
                    new SessionDescription(JSON.parse(answer))
                );
            });
        }, errorHandler, constraints);

    } else {
        // answerer must wait for the data channel
        pc.ondatachannel = function (e) {
            channel = e.channel;
            bindEvents(); //now bind the events
        };

        // answerer needs to wait for an offer before
        // generating the answer SDP
        recv(ROOM, "offer", function (offer) {
            pc.setRemoteDescription(
                new SessionDescription(JSON.parse(offer))
            );

            // now we can generate our answer SDP
            pc.createAnswer(function (answer) {
                pc.setLocalDescription(answer);

                // send it to FireBase
                send(ROOM, "answer", JSON.stringify(answer));
            }, errorHandler, constraints);
        });
    }
}

// bind the channel events
function bindEvents () {
    channel.onopen = function () { console.log("Channel Open"); }
    channel.onmessage = function (e) {
        // add the message to the chat log
        chatlog.innerHTML += "<div>Peer says: " + e.data + "</div>";
    };
}

chatform.addEventListener('submit', function(e) {
    e.preventDefault();
    sendMessage();
})

// send a message the textbox throught
// the data channel for a chat program
function sendMessage () {
    var msg = message.value;
    channel.send(msg);
    message.value = "";
}